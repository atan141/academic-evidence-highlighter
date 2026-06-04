const fields = {
  question: document.querySelector("#question"),
  conceptOne: document.querySelector("#conceptOne"),
  conceptTwo: document.querySelector("#conceptTwo"),
  extraTerms: document.querySelector("#extraTerms")
};

const scanButton = document.querySelector("#scanButton");
const scanFileButton = document.querySelector("#scanFileButton");
const pdfFileInput = document.querySelector("#pdfFileInput");
const clearButton = document.querySelector("#clearButton");
const exportButton = document.querySelector("#exportButton");
const sortMode = document.querySelector("#sortMode");
const confidenceFilter = document.querySelector("#confidenceFilter");
const statusEl = document.querySelector("#status");
const countEl = document.querySelector("#count");
const resultsEl = document.querySelector("#results");
const FIELD_KEYS = Object.keys(fields);
const UI_PREF_KEYS = ["sortMode", "confidenceFilter"];

let currentResults = [];
let pageInfo = {};
let pdfjsLibPromise = null;
let lastAutoQuestion = "";
let refreshTimer = null;
let lastActiveUrl = "";
let autoScanInFlight = false;

init();

async function init() {
  const saved = await chrome.storage.sync.get([...FIELD_KEYS, ...UI_PREF_KEYS]);
  Object.entries(fields).forEach(([key, input]) => {
    input.value = saved[key] || "";
    input.addEventListener("input", saveSettings);
  });
  sortMode.value = saved.sortMode || "order";
  confidenceFilter.value = saved.confidenceFilter && saved.confidenceFilter !== "all"
    ? saved.confidenceFilter
    : "noReferences";

  scanButton.addEventListener("click", scanCurrentTab);
  scanFileButton.addEventListener("click", () => pdfFileInput.click());
  pdfFileInput.addEventListener("change", scanSelectedPdf);
  clearButton.addEventListener("click", clearAll);
  exportButton.addEventListener("click", exportCsv);
  sortMode.addEventListener("change", saveUiPreferencesAndRender);
  confidenceFilter.addEventListener("change", saveUiPreferencesAndRender);
  await prefillFromPage();
  await annotateCurrentScholarResults();
  await rememberActiveUrl();
  startSearchWatcher();
  startTabWatcher();
}

async function saveSettings() {
  await chrome.storage.sync.set(getSettings());
}

async function saveUiPreferencesAndRender() {
  await chrome.storage.sync.set({
    sortMode: sortMode.value,
    confidenceFilter: confidenceFilter.value
  });
  renderResults();
}

function getSettings() {
  return Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value.trim()]));
}

function startSearchWatcher() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => {
    prefillFromPage({ forceScan: false, silent: true, clearResultsOnChange: true });
  }, 2000);
}

function startTabWatcher() {
  window.setInterval(async () => {
    try {
      const tab = await getActiveTab();
      const url = tab?.url || "";
      if (!url || url === lastActiveUrl) return;
      lastActiveUrl = url;
      await handleActivePageChanged(tab);
    } catch {
      // Ignore transient tab states while Chrome is navigating.
    }
  }, 1200);
}

async function rememberActiveUrl() {
  const tab = await getActiveTab();
  lastActiveUrl = tab?.url || "";
}

async function handleActivePageChanged(tab) {
  currentResults = [];
  renderResults();
  if (isUnsupportedUrl(tab.url || "")) {
    setStatus("New tab detected, but this page cannot be scanned by the extension.");
    return;
  }
  if (looksLikeLocalPdfUrl(tab.url || "")) {
    setStatus("New local PDF detected. Use Scan saved PDF to choose the file directly.");
    return;
  }
  setStatus("New page detected. Auto-scanning with the current research question...");
  await clearPageHighlightsOnly();
  await prefillFromPage({ forceScan: false, silent: true });
  await autoScanCurrentTab();
}

async function autoScanCurrentTab() {
  if (autoScanInFlight) return;
  const settings = getSettings();
  if (!settings.question && !settings.conceptOne && !settings.conceptTwo && !settings.extraTerms) {
    setStatus("New page detected. Enter a research question or search Scholar to start scanning.");
    return;
  }

  autoScanInFlight = true;
  try {
    await scanCurrentTab({ auto: true });
  } finally {
    autoScanInFlight = false;
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function scanCurrentTab(options = {}) {
  const { auto = false } = options;
  await prefillFromPage({ forceScan: false, silent: true });
  await annotateCurrentScholarResults();
  await saveSettings();
  setStatus(auto ? "Auto-scanning this page..." : "Scanning visible article text...");
  scanButton.disabled = true;

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab found.");

    let response;
    if (looksLikeLocalPdfUrl(tab.url || "")) {
      setStatus("Chrome is showing a local PDF viewer. Use Scan saved PDF to choose the downloaded file directly.");
      return;
    } else if (looksLikePdfUrl(tab.url || "")) {
      response = await scanPdfUrl(tab.url, tab.title || "PDF");
    } else {
      response = await sendPageMessage(tab.id, "EEH_SCAN");
      if ((!response.results || response.results.length === 0) && response.pdfLinks?.length) {
        setStatus("No page-text matches. Trying the first PDF link...");
        response = await scanPdfUrl(response.pdfLinks[0], response.title || tab.title || "PDF");
      }
    }

    currentResults = response.results || [];
    pageInfo = { title: response.title, url: response.url, isPdfLike: response.isPdfLike };
    renderResults();

    if (pageInfo.isPdfLike) {
      setStatus(currentResults.length
        ? "Scanned PDF text. Built-in PDF viewers cannot be highlighted yet, so review the evidence cards here."
        : "Could not extract useful PDF text. Some journal PDFs are protected, image-only, or compressed beyond this prototype.");
    } else if (currentResults.length) {
      setStatus("Review the highlighted sentences. Treat every item as candidate evidence until you verify it.");
    } else {
      setStatus("No candidates found. Try broader target terms or open the full-text article page.");
    }
  } catch (error) {
    if (/403|401|forbidden|unauthorized/i.test(error.message)) {
      setStatus("This PDF server blocked extension access. Use Scan saved PDF after saving/downloading the PDF.");
    } else {
      setStatus(`Could not scan this tab: ${error.message}`);
    }
  } finally {
    scanButton.disabled = false;
  }
}

async function scanSelectedPdf() {
  const file = pdfFileInput.files?.[0];
  if (!file) return;

  await saveSettings();
  scanFileButton.disabled = true;
  setStatus(`Scanning saved PDF: ${file.name}`);

  try {
    const buffer = await file.arrayBuffer();
    const pages = await extractPdfPages(buffer);
    const text = pages.map((page) => page.text).join("\n\n");
    currentResults = scanPdfPages(pages, getSettings(), file.name, `local:${file.name}`);
    pageInfo = { title: file.name, url: `local:${file.name}`, isPdfLike: true };
    renderResults();
    if (currentResults.length) {
      setStatus(`Scanned the saved PDF locally and extracted ${text.length.toLocaleString()} text characters. Review evidence cards here; local PDFs cannot be page-highlighted yet.`);
    } else if (text.length < 200) {
      setStatus("I could not extract readable text from this PDF. It may be scanned images, encrypted, or too compressed for this prototype parser.");
    } else {
      setStatus(`Extracted ${text.length.toLocaleString()} text characters, but found no candidates for the current question. Try broader terms or a different question.`);
    }
  } catch (error) {
    setStatus(`Could not scan saved PDF: ${error.message}`);
  } finally {
    scanFileButton.disabled = false;
    pdfFileInput.value = "";
  }
}

async function clearAll() {
  try {
    const tab = await getActiveTab();
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "EEH_CLEAR" });
  } catch {
    // Some browser pages do not accept content-script messages.
  }
  Object.values(fields).forEach((input) => {
    input.value = "";
  });
  await chrome.storage.sync.remove(FIELD_KEYS);
  lastAutoQuestion = "";
  currentResults = [];
  renderResults();
  setStatus("Cleared search fields, results, and page highlights.");
}

function renderResults() {
  const visibleResults = getVisibleResults();
  countEl.textContent = String(visibleResults.length);
  exportButton.disabled = currentResults.length === 0;
  resultsEl.replaceChildren();

  visibleResults.forEach((result, index) => {
    const card = document.createElement("article");
    card.className = "result";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Show candidate ${index + 1} in the paper`);
    card.addEventListener("click", () => focusResult(result));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        focusResult(result);
      }
    });

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(
      pill(result.confidence, result.confidence),
      pill(result.evidenceType),
      pill(`#${index + 1}`)
    );

    const sentence = document.createElement("div");
    sentence.className = "sentence";
    appendHighlightedSentence(sentence, result.sentence, result.answerTerms || []);

    const answerChips = document.createElement("div");
    answerChips.className = "answerChips";
    (result.answerTerms || []).slice(0, 8).forEach((answer) => {
      const chip = document.createElement("span");
      chip.className = "answerChip";
      chip.textContent = answer;
      answerChips.append(chip);
    });

    const fieldsBlock = document.createElement("div");
    fieldsBlock.className = "fields";
    const detailLines = [
      line("Short summary", result.summary),
      line("Concepts", result.concepts),
      line("Matched", result.matchedTerms?.join(", ") || "n/a")
    ];
    if (result.pageNumber) {
      detailLines.splice(1, 0, line("PDF page", result.pageNumber));
    }
    fieldsBlock.append(...detailLines);

    const focusButton = document.createElement("button");
    focusButton.className = "cardButton";
    focusButton.textContent = "Show highlight";
    focusButton.addEventListener("click", (event) => {
      event.stopPropagation();
      focusResult(result);
    });

    if (answerChips.childElementCount) card.append(meta, answerChips, sentence, fieldsBlock, focusButton);
    else card.append(meta, sentence, fieldsBlock, focusButton);
    resultsEl.append(card);
  });
}

function getVisibleResults() {
  const rank = { high: 3, medium: 2, low: 1 };
  const filter = confidenceFilter.value;
  const filtered = currentResults.filter((result) => {
    if (filter === "allWithReferences") return true;
    if (filter === "noReferences") return result.confidence !== "reference";
    if (filter === "reference") return result.confidence === "reference";
    if (filter === "medium") return ["high", "medium"].includes(result.confidence);
    return result.confidence === filter;
  });

  return [...filtered].sort((a, b) => {
    if (sortMode.value === "compatibility") {
      return (rank[b.confidence] - rank[a.confidence]) || ((b.score || 0) - (a.score || 0)) || ((a.order || 0) - (b.order || 0));
    }
    return (a.order || 0) - (b.order || 0);
  });
}

function appendHighlightedSentence(container, sentence, answerTerms) {
  const terms = [...new Set(answerTerms.map((term) => term.trim()).filter((term) => term.length > 2))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
  if (!terms.length) {
    container.textContent = sentence;
    return;
  }

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "ig");
  let lastIndex = 0;
  sentence.replace(pattern, (match, _capture, offset) => {
    container.append(document.createTextNode(sentence.slice(lastIndex, offset)));
    const span = document.createElement("span");
    span.className = "answerText";
    span.textContent = match;
    container.append(span);
    lastIndex = offset + match.length;
    return match;
  });
  container.append(document.createTextNode(sentence.slice(lastIndex)));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function focusResult(result) {
  if (pageInfo.isPdfLike || result.id?.startsWith("pdf-")) {
    if (result.pageNumber && pageInfo.url && !pageInfo.url.startsWith("local:")) {
      await jumpToPdfPage(pageInfo.url, result.pageNumber);
      setStatus(`Opened PDF page ${result.pageNumber}. Built-in PDF viewers cannot show extension highlights yet.`);
    } else if (result.pageNumber) {
      setStatus(`This result is on PDF page ${result.pageNumber}. Local saved PDFs cannot be jumped/highlighted yet.`);
    } else {
      setStatus("This result came from extracted PDF text, so there is no page highlight to jump to yet.");
    }
    return;
  }

  const tab = await getActiveTab();
  try {
    if (!tab?.id) return;
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "EEH_FOCUS",
      id: result.id,
      sentence: result.sentence
    });

    if (response?.found === false) {
      setStatus("I could not find that exact highlight on the page. Try scanning this page again.");
    }
  } catch {
    setStatus("I could not jump to that page highlight. Try scanning this page again.");
  }
}

async function jumpToPdfPage(url, pageNumber) {
  const tab = await getActiveTab();
  if (!tab?.id) return;
  const baseUrl = url.split("#")[0];
  await chrome.tabs.update(tab.id, { url: `${baseUrl}#page=${pageNumber}` });
}

function pill(text, tone = "") {
  const el = document.createElement("span");
  el.className = `pill ${tone}`;
  el.textContent = text || "candidate";
  return el;
}

function line(label, value) {
  const el = document.createElement("div");
  el.textContent = `${label}: ${value || "unknown"}`;
  return el;
}

function setStatus(message) {
  statusEl.textContent = message;
}

async function prefillFromPage(options = {}) {
  const { forceScan = true, silent = false, clearResultsOnChange = false } = options;
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return;

    const response = await sendPageMessage(tab.id, "EEH_SUGGEST");
    const suggestion = response.suggestion || {};
    let changed = false;

    const canUsePageSuggestion = ["search_input", "url_query"].includes(suggestion.source);
    const currentQuestion = fields.question.value.trim();
    const isNewScholarSearch = canUsePageSuggestion && suggestion.question && currentQuestion !== suggestion.question;
    const shouldUsePageSuggestion = isNewScholarSearch;

    Object.entries(fields).forEach(([key, input]) => {
      if (shouldUsePageSuggestion && suggestion[key]) {
        input.value = suggestion[key];
        changed = true;
      } else if (canUsePageSuggestion && !input.value.trim() && suggestion[key]) {
        input.value = suggestion[key];
        changed = true;
      }
    });

    if (changed) {
      await saveSettings();
      lastAutoQuestion = suggestion.question;
      if (clearResultsOnChange) {
        await clearPageHighlightsOnly();
        currentResults = [];
        renderResults();
      }
      await annotateCurrentScholarResults();
      if (!silent) setStatus("Updated from the current Scholar search. You can edit the fields, or scan now.");
      if (forceScan && suggestion.conceptOne && suggestion.conceptTwo) {
        await scanCurrentTab();
      }
    } else if (!silent && !canUsePageSuggestion && fields.question.value.trim()) {
      setStatus("Using your saved search intent. Page titles will not replace your concepts.");
    } else if (!silent && response.pdfLinks?.length) {
      setStatus(`Found ${response.pdfLinks.length} PDF link(s). This prototype can detect them, but it cannot yet read protected PDF viewers directly.`);
    }
  } catch {
    if (!silent) setStatus("Open Scholar, an abstract page, or an article HTML page, then scan.");
  }
}

async function annotateCurrentScholarResults() {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    await sendPageMessage(tab.id, "EEH_ANNOTATE_RESULTS");
  } catch {
    // Annotation is a Scholar-only enhancement; ignore pages that cannot be annotated.
  }
}

async function clearPageHighlightsOnly() {
  try {
    const tab = await getActiveTab();
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, { type: "EEH_CLEAR" });
  } catch {
    // The active page may not accept extension messages.
  }
}

async function sendPageMessage(tabId, type) {
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type,
      settings: getSettings()
    });
  } catch (error) {
    await injectContentScript(tabId);
    return chrome.tabs.sendMessage(tabId, {
      type,
      settings: getSettings()
    });
  }
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["extension/content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["extension/content.js"] });
  } catch (rootError) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

function exportCsv() {
  const rows = [
    ["Short summary", "Extracted answer", "Concepts", "PDF page", "Evidence type", "Confidence", "Evidence sentence", "Page title", "URL"]
  ];

  currentResults.forEach((result) => {
    rows.push([
      result.summary,
      (result.answerTerms || []).join("; "),
      result.concepts,
      result.pageNumber || "",
      result.evidenceType,
      result.confidence,
      result.sentence,
      pageInfo.title || result.pageTitle,
      pageInfo.url || result.url
    ]);
  });

  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "academic-evidence-candidates.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value) {
  const text = String(value || "");
  return `"${text.replaceAll('"', '""')}"`;
}

function looksLikePdfUrl(url) {
  return /\.pdf(?:$|[?#])/i.test(url);
}

function looksLikeLocalPdfUrl(url) {
  return url.startsWith("file://") && looksLikePdfUrl(url);
}

function isUnsupportedUrl(url) {
  return /^(chrome|chrome-extension|edge|about):/i.test(url);
}

async function scanPdfUrl(url, title) {
  setStatus("Fetching PDF text...");
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`PDF request failed with ${response.status}`);

  const buffer = await response.arrayBuffer();
  const pages = await extractPdfPages(buffer);
  const results = scanPdfPages(pages, getSettings(), title, url);
  return { ok: true, results, title, url, isPdfLike: true };
}

async function extractPdfText(buffer) {
  const pages = await extractPdfPages(buffer);
  return pages.map((page) => page.text).join("\n\n");
}

async function extractPdfPages(buffer) {
  try {
    return await extractPdfPagesWithPdfJs(buffer);
  } catch {
    // Some PDFs cannot be parsed by PDF.js in the side panel context; try the lightweight fallback.
  }

  const text = await extractPdfTextRough(buffer);
  return [{ pageNumber: null, text }];
}

async function extractPdfPagesWithPdfJs(buffer) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => item.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) pages.push({ pageNumber, text: pageText });
  }

  return pages;
}

async function loadPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = importExtensionModule(["extension/pdf.mjs", "pdf.mjs"]).then(({ module, path }) => {
      module.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
        path.startsWith("extension/") ? "extension/pdf.worker.mjs" : "pdf.worker.mjs"
      );
      return module;
    });
  }
  return pdfjsLibPromise;
}

async function importExtensionModule(paths) {
  let lastError;
  for (const path of paths) {
    try {
      return { module: await import(chrome.runtime.getURL(path)), path };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function extractPdfTextRough(buffer) {
  const bytes = new Uint8Array(buffer);
  const latin = latin1Decode(bytes);
  const streamTexts = [];
  const streamPattern = /<<(?:.|\n|\r){0,1200}?>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let match;

  while ((match = streamPattern.exec(latin))) {
    const headerStart = Math.max(0, match.index - 1200);
    const header = latin.slice(headerStart, match.index);
    const raw = latin1Encode(match[1]);

    if (/FlateDecode/i.test(header)) {
      const inflated = await tryInflate(raw);
      if (inflated) streamTexts.push(extractPdfStrings(latin1Decode(inflated)));
    } else {
      streamTexts.push(extractPdfStrings(match[1]));
    }
  }

  streamTexts.push(extractPdfStrings(latin));
  return streamTexts.join(" ").replace(/\s+/g, " ").trim();
}

async function tryInflate(bytes) {
  if (!("DecompressionStream" in globalThis)) return null;
  for (const format of ["deflate", "deflate-raw"]) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // Try the next supported format.
    }
  }
  return null;
}

function extractPdfStrings(text) {
  const parts = [];
  const literalPattern = /\((?:\\.|[^\\)]){2,}\)/g;
  const hexPattern = /<([0-9A-Fa-f\s]{8,})>/g;
  let match;

  while ((match = literalPattern.exec(text))) {
    const value = decodePdfLiteral(match[0].slice(1, -1));
    if (looksReadable(value)) parts.push(value);
  }

  while ((match = hexPattern.exec(text))) {
    const value = decodePdfHex(match[1]);
    if (looksReadable(value)) parts.push(value);
  }

  return parts.join(" ");
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\\d{1,3}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodePdfHex(value) {
  const clean = value.replace(/\s+/g, "");
  const chars = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    chars.push(String.fromCharCode(parseInt(clean.slice(i, i + 2), 16)));
  }
  return chars.join("").replace(/\s+/g, " ").trim();
}

function looksReadable(value) {
  if (!value || value.length < 3) return false;
  const letters = value.match(/[A-Za-z]/g)?.length || 0;
  return letters / value.length > 0.45;
}

function latin1Decode(bytes) {
  let text = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    text += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return text;
}

function latin1Encode(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 255;
  return bytes;
}

function scanPlainText(text, settings, title, url) {
  return scanPdfPages([{ pageNumber: null, text }], settings, title, url);
}

function scanPdfPages(pages, settings, title, url) {
  const intent = inferIntent(settings);
  const conceptTerms = normalizeTerms([settings.conceptOne, settings.conceptTwo]);
  const questionTerms = termsFromText(settings.question || "");
  const extraTerms = normalizeTerms((settings.extraTerms || "").split(/[,;\n]/));
  const allTerms = [...new Set([...conceptTerms, ...questionTerms, ...extraTerms])];
  const allCandidates = [];
  let inReferenceSection = false;

  pages.forEach((page, pageIndex) => {
    if (startsReferenceSection(page.text)) inReferenceSection = true;
    const context = getTargetContext(settings, page.text.slice(0, 1200));
    splitSentences(page.text).forEach((sentence, sentenceIndex) => {
      const scored = scoreSentence(sentence, conceptTerms, allTerms, intent, context);
      if (scored.score < intent.threshold) return;
      const answerTerms = extractAnswerTerms(sentence, intent);
      const order = allCandidates.length;
      const isReference = inReferenceSection || isReferenceSentence(sentence);

      allCandidates.push({
        id: `pdf-${page.pageNumber || pageIndex + 1}-${sentenceIndex}`,
        sentence,
        answerTerms,
        summary: summarizeSentence(sentence, settings, intent),
        concepts: conceptLabel(settings, scored.matches),
        evidenceType: isReference ? "reference" : inferEvidenceType(sentence),
        confidence: isReference ? "reference" : confidenceFromScore(scored.score, intent, scored.directness),
        score: scored.score,
        order,
        pageNumber: page.pageNumber,
        matchedTerms: scored.matches,
        pageTitle: title,
        url
      });
    });
  });

  return dedupeCandidates(allCandidates).slice(0, 80);
}

function startsReferenceSection(text) {
  return /\b(references|bibliography|literature cited|works cited)\b/i.test(text.slice(0, 300));
}

function isReferenceSentence(sentence) {
  const citationLike = /\(\d{4}\)|\bdoi\b|https?:\/\/|[A-Z][A-Za-z-]+,\s+[A-Z]\./g;
  return (sentence.match(citationLike) || []).length >= 2;
}

const FOOD_EVIDENCE_TERMS = [
  "eat", "eats", "eaten", "ate", "feed", "feeds", "feeding", "fed on", "forage",
  "forages", "foraging", "consume", "consumes", "consumed", "diet consists",
  "diet included", "prey", "stomach contents", "crop contents", "algae",
  "brine shrimp", "plankton", "shrimp", "crustaceans", "insects", "fish", "seeds", "fruit", "nectar"
];

const RELATION_TERMS = [
  "related", "relationship", "associated", "association", "correlated", "correlation",
  "linked", "increased", "decreased", "higher", "lower", "more", "less", "greater",
  "reduced", "effect", "effects", "influence", "impact", "predict", "caused", "driven",
  "compared", "whereas"
];

const EVIDENCE_PATTERNS = [
  { type: "care guidance", terms: ["care", "guide", "should", "must", "require", "provide", "avoid", "housing", "bedding", "feeding", "veterinary"] },
  { type: "relationship", terms: ["related", "relationship", "associated", "association", "correlated", "linked"] },
  { type: "increase/decrease", terms: ["increased", "decreased", "higher", "lower", "more", "less", "greater", "reduced"] },
  { type: "food evidence", terms: FOOD_EVIDENCE_TERMS },
  { type: "effect", terms: ["effect", "effects", "influence", "impact", "predict", "caused", "driven"] },
  { type: "comparison", terms: ["compared", "whereas", "than", "between"] },
  { type: "candidate evidence", terms: [] }
];

function scoreSentence(sentence, conceptTerms, allTerms, intent = inferIntent({}), context = {}) {
  const lower = sentence.toLowerCase();
  const matches = [];
  let score = 0;

  const conceptMatches = conceptTerms.filter((term) => includesTerm(lower, term));
  if (conceptMatches.length === 1) score += 3;
  if (conceptMatches.length >= 2) score += 8;
  matches.push(...conceptMatches);

  for (const term of allTerms) {
    if (!conceptMatches.includes(term) && includesTerm(lower, term)) {
      score += term.length > 8 ? 2 : 1;
      matches.push(term);
    }
  }

  const relationMatches = RELATION_TERMS.filter((term) => includesTerm(lower, term));
  if (relationMatches.length) {
    score += Math.min(4, relationMatches.length + 1);
    matches.push(...relationMatches.slice(0, 3));
  }

  if (intent.kind === "food") {
    const foodEvidence = classifyFoodEvidence(sentence, context);
    if (foodEvidence.directness === "direct") {
      score += 12;
      matches.push(...foodEvidence.matches.slice(0, 4));
    } else if (foodEvidence.directness === "method") {
      score += 2;
      matches.push(...foodEvidence.matches.slice(0, 3));
    } else if (foodEvidence.directness === "behavior") {
      score -= 1;
      matches.push(...foodEvidence.matches.slice(0, 2));
    } else {
      score -= 6;
    }
    if (foodEvidence.offTopic) score -= 18;
    return { score, matches: [...new Set(matches)].slice(0, 10), directness: foodEvidence.directness };
  }

  if (intent.kind === "guide") {
    const guideEvidence = classifyGuideEvidence(sentence);
    if (guideEvidence.directness === "direct") {
      score += 10;
      matches.push(...guideEvidence.matches.slice(0, 5));
    } else if (guideEvidence.directness === "topic") {
      score += 4;
      matches.push(...guideEvidence.matches.slice(0, 4));
    } else {
      score -= 4;
    }
    return { score, matches: [...new Set(matches)].slice(0, 10), directness: guideEvidence.directness };
  }

  return { score, matches: [...new Set(matches)].slice(0, 10), directness: "general" };
}

function inferIntent(settings) {
  const text = `${settings.question || ""} ${settings.conceptTwo || ""} ${settings.extraTerms || ""}`.toLowerCase();
  if (/\b(what|which).*\b(eat|eats|food|diet|feed|prey)\b/.test(text) || /\b(food|diet|prey|feeding)\b/.test(text)) {
    return { kind: "food", threshold: 5 };
  }
  if (/\b(care|guide|husbandry|handling|housing|bedding|cage|enrichment|veterinary|health|cleaning)\b/.test(text)) {
    return { kind: "guide", threshold: 6 };
  }
  return { kind: "relationship", threshold: 3 };
}

function summarizeSentence(sentence, settings, intent = inferIntent(settings)) {
  const trimmed = sentence.replace(/\s+/g, " ").trim();
  const conceptOne = settings.conceptOne?.trim();
  const conceptTwo = settings.conceptTwo?.trim();

  if (intent.kind === "food" && conceptOne) {
    const food = inferFoodAnswer(trimmed);
    return food ? `${conceptOne} may eat ${food}.` : compressSentence(trimmed);
  }

  if (intent.kind === "guide") {
    const topic = extractGuideTopic(trimmed);
    return topic ? `Key care point: ${topic}.` : compressSentence(trimmed);
  }

  if (conceptOne && conceptTwo) {
    const direction = inferDirection(trimmed);
    return `${conceptOne} ${direction} ${conceptTwo}.`;
  }

  return compressSentence(trimmed);
}

function inferFoodAnswer(sentence) {
  const patterns = [
    /\b(?:eat|eats|eaten|ate|feed(?:s|ing)? on|fed on|forage(?:s|d)? on|consume[sd]?)\s+([^.;:,()]{3,90})/i,
    /\bdiet (?:consists of|included|includes|was composed of)\s+([^.;:,()]{3,90})/i,
    /\b(?:prey|food items?) (?:included|include|were|was)\s+([^.;:,()]{3,90})/i
  ];

  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (match?.[1]) return cleanAnswer(match[1]);
  }

  const foods = sentence.match(/\b(algae|brine shrimp|shrimp|crustaceans?|insects?|fish|mollusks?|seeds?|fruits?|nectar|plants?)\b/gi);
  return foods ? [...new Set(foods.map((item) => item.toLowerCase()))].slice(0, 4).join(", ") : "";
}

function extractAnswerTerms(sentence, intent = inferIntent({})) {
  if (intent.kind === "food") {
    const foods = sentence.match(/\b(algae|diatoms?|cyanobacteria|brine shrimp|shrimp|crustaceans?|copepods?|mollusks?|insects?|larvae|fish|seeds?|fruits?|nectar|plants?|plankton)\b/gi) || [];
    if (foods.length) return [...new Set(foods.map((item) => item.toLowerCase()))].slice(0, 8);

    const object = sentence.match(/\b(?:eat|eats|eaten|ate|feed(?:s|ing)? on|fed on|forage(?:s|d)? on|consume[sd]?|diet (?:consists of|included|includes|was composed of))\s+([^.;:,()]{3,90})/i);
    if (object?.[1]) return splitAnswerPhrase(object[1]);

    if (/\bfilter feeding|filter-feeding\b/i.test(sentence)) return ["filter feeding"];
    return [];
  }

  if (intent.kind === "guide") {
    const terms = sentence.match(/\b(housing|cage|enclosure|bedding|substrate|nesting|food|feeding|water|diet|handling|social|solitary|exercise|wheel|enrichment|cleaning|hygiene|temperature|humidity|veterinary|illness|disease|stress|avoid|provide|required|should|must)\b/gi) || [];
    return [...new Set(terms.map((term) => term.toLowerCase()))].slice(0, 8);
  }

  const relation = sentence.match(/\b(?:related to|associated with|correlated with|increased|decreased|higher|lower|greater|reduced|influenced|affected|predicted)\s+([^.;:,()]{3,90})/i);
  return relation?.[1] ? splitAnswerPhrase(relation[1]) : [];
}

function classifyGuideEvidence(sentence) {
  const careTopics = sentence.match(/\b(housing|cage|enclosure|bedding|substrate|nesting|food|feeding|water|diet|handling|social|solitary|exercise|wheel|enrichment|cleaning|hygiene|temperature|humidity|veterinary|illness|disease|stress)\b/gi) || [];
  const actionWords = sentence.match(/\b(should|must|require[sd]?|need[sd]?|provide[sd]?|avoid(?:ed)?|keep|kept|clean(?:ed)?|monitor(?:ed)?|recommend(?:ed)?|suitable|appropriate|essential|important|safe|unsafe)\b/gi) || [];
  const genericOnly = /\b(book|chapter|website|guide|handbook|study|analysis|review)\b/i.test(sentence) && !careTopics.length;

  if (genericOnly) return { directness: "none", matches: [] };
  if (careTopics.length && actionWords.length) {
    return {
      directness: "direct",
      matches: [...new Set([...careTopics, ...actionWords].map((item) => item.toLowerCase()))]
    };
  }
  if (careTopics.length) {
    return {
      directness: "topic",
      matches: [...new Set(careTopics.map((item) => item.toLowerCase()))]
    };
  }
  return { directness: "none", matches: [] };
}

function extractGuideTopic(sentence) {
  const match = sentence.match(/\b(?:should|must|require[sd]?|need[sd]?|provide[sd]?|avoid(?:ed)?|keep|kept|recommend(?:ed)?)\s+([^.;:,]{4,110})/i);
  if (match?.[1]) return cleanAnswer(match[1]);
  const terms = sentence.match(/\b(housing|cage|enclosure|bedding|food|feeding|water|handling|exercise|enrichment|cleaning|temperature|veterinary|illness|stress)\b/gi);
  return terms ? [...new Set(terms.map((term) => term.toLowerCase()))].slice(0, 4).join(", ") : "";
}

function splitAnswerPhrase(value) {
  return value
    .replace(/\b(?:and|or|the|a|an|of|from|their|its|such as|including)\b/gi, ",")
    .split(/[,;/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2 && part.length < 45)
    .slice(0, 8);
}

function classifyFoodEvidence(sentence, context = {}) {
  const specificFoods = sentence.match(/\b(algae|diatoms?|cyanobacteria|brine shrimp|shrimp|crustaceans?|copepods?|mollusks?|insects?|larvae|fish|seeds?|fruits?|nectar|plants?)\b/gi) || [];
  const directDietPhrase = /\b(diet (?:consists of|included|includes|was composed of)|prey (?:included|include|were|was)|food items? (?:included|include|were|was)|stomach contents? (?:contained|included))\b/i.test(sentence);
  const directEatingObject = /\b(eat|eats|eaten|ate|consume[sd]?|fed on|feed(?:s|ing)? on|forage(?:s|d)? on)\s+([^.;:,()]{3,90})/i.test(sentence);
  const methodOnly = /\bfilter feeding|filter-feeding|filter feeders?|filter-feeders?\b/i.test(sentence);
  const behaviorOnly = /\b(feed(?:ing|s)?|forag(?:e|es|ed|ing))\b/i.test(sentence);
  const habitatOrAbundanceOnly = /\b(habitat|habitats|wetland|wetlands|mudflat|mudflats|water depth|agricultural fields?|paddy fields?|abundance|density|distribution|spatial|disturbance|food resources?)\b/i.test(sentence);
  const colorOnly = /\b(color|colour|plumage|pigment|carotenoid|pink|red|orange|ornament|feather)\b/i.test(sentence);

  if (specificFoods.length && (directDietPhrase || directEatingObject || /\b(prey|food items?|stomach contents?|diet)\b/i.test(sentence))) {
    return {
      directness: "direct",
      matches: [...new Set([...specificFoods.map((item) => item.toLowerCase()), "direct food item"])],
      offTopic: targetMismatch(sentence, context)
    };
  }

  if (specificFoods.length && !colorOnly && !habitatOrAbundanceOnly) {
    return {
      directness: "direct",
      matches: [...new Set(specificFoods.map((item) => item.toLowerCase()))],
      offTopic: targetMismatch(sentence, context)
    };
  }

  if (methodOnly) {
    return { directness: "method", matches: ["filter feeding"], offTopic: false };
  }

  if (behaviorOnly) {
    return {
      directness: "behavior",
      matches: ["feeding/foraging behavior"],
      offTopic: habitatOrAbundanceOnly || colorOnly
    };
  }

  return { directness: "none", matches: [], offTopic: habitatOrAbundanceOnly || colorOnly || targetMismatch(sentence, context) };
}

function getTargetContext(settings, blockText = "") {
  const aliases = targetAliases(settings.conceptOne || "");
  return {
    aliases,
    blockHasTarget: aliases.some((alias) => includesTerm(blockText.toLowerCase(), alias))
  };
}

function targetMismatch(sentence, context = {}) {
  if (!context.aliases?.length) return false;
  const lower = sentence.toLowerCase();
  if (context.aliases.some((alias) => includesTerm(lower, alias))) return false;
  if (context.blockHasTarget && !mentionsOtherLikelyBird(lower, context.aliases)) return false;
  return true;
}

function targetAliases(rawTarget) {
  const target = rawTarget.toLowerCase().trim();
  if (!target) return [];
  const aliases = new Set([target]);
  target.split(/\s+/).filter((word) => word.length > 3).forEach((word) => {
    aliases.add(word.endsWith("s") ? word.slice(0, -1) : word);
  });

  const known = {
    "black phoebe": ["black phoebe", "phoebe", "sayornis nigricans"],
    "pink flamingo": ["pink flamingo", "flamingo", "flamingos"],
    "pink flamingos": ["pink flamingo", "flamingo", "flamingos"],
    "greater flamingo": ["greater flamingo", "flamingo", "flamingos", "phoenicopterus roseus"]
  };
  (known[target] || []).forEach((alias) => aliases.add(alias));
  return [...aliases];
}

function mentionsOtherLikelyBird(lowerSentence, targetAliasesList) {
  const birdWords = [
    "flamingo", "flamingos", "phoebe", "phoebes", "gull", "gulls", "seagull", "seagulls",
    "robin", "robins", "duck", "ducks", "goose", "geese", "warbler", "warblers",
    "sparrow", "sparrows", "heron", "herons", "egret", "egrets", "ibis", "ibises",
    "shorebird", "shorebirds", "sandpiper", "sandpipers", "tern", "terns"
  ];
  return birdWords.some((bird) => lowerSentence.includes(bird) && !targetAliasesList.some((alias) => includesTerm(lowerSentence, alias)));
}

function cleanAnswer(value) {
  return value.replace(/\b(?:and|or|the|a|an|of|from|their|its)\s*$/i, "").replace(/\s+/g, " ").trim();
}

function inferDirection(sentence) {
  if (/\b(higher|greater|more|increased|increase|positive|positively)\b/i.test(sentence)) return "may increase or be positively related to";
  if (/\b(lower|less|decreased|decrease|reduced|negative|negatively)\b/i.test(sentence)) return "may decrease or be negatively related to";
  if (/\b(no|not|neither|unrelated|not associated|no association|no relationship)\b/i.test(sentence)) return "may not be clearly related to";
  return "may be related to";
}

function inferEvidenceType(sentence) {
  const lower = sentence.toLowerCase();
  for (const pattern of EVIDENCE_PATTERNS) {
    if (pattern.terms.some((term) => includesTerm(lower, term))) return pattern.type;
  }
  return "candidate evidence";
}

function confidenceFromScore(score, intent = inferIntent({}), directness = "general") {
  if (intent.kind === "food") {
    if (directness === "direct" && score >= 14) return "high";
    if (directness === "direct" && score >= 9) return "medium";
    if (directness === "method") return "medium";
    return "low";
  }
  if (intent.kind === "guide") {
    if (directness === "direct" && score >= 12) return "high";
    if (directness === "direct" || directness === "topic") return "medium";
    return "low";
  }
  if (score >= 10) return "high";
  if (score >= 6) return "medium";
  return "low";
}

function conceptLabel(settings, matches) {
  const concepts = [settings.conceptOne, settings.conceptTwo].map((item) => item?.trim()).filter(Boolean);
  return concepts.length ? concepts.join(" + ") : matches.slice(0, 4).join(" + ");
}

function splitSentences(text) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9(])/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length >= 35 && sentence.length <= 800);
}

function termsFromText(text) {
  const stopWords = new Set(["about", "after", "again", "against", "also", "and", "are", "because", "been", "between", "does", "for", "from", "has", "have", "how", "into", "its", "that", "the", "their", "then", "there", "this", "with", "what", "when", "where", "whether", "which", "why"]);
  return normalizeTerms(text.split(/[^A-Za-z0-9-]+/).filter((word) => word.length > 2 && !stopWords.has(word.toLowerCase())));
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidate.sentence.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTerms(terms) {
  return [...new Set(terms.map((term) => term?.trim().toLowerCase()).filter(Boolean))];
}

function includesTerm(lowerText, term) {
  if (!term) return false;
  const normalized = term.toLowerCase().trim();
  if (lowerText.includes(normalized)) return true;
  if (normalized.endsWith("s") && lowerText.includes(normalized.slice(0, -1))) return true;
  const words = normalized.split(/\s+/).filter((word) => word.length > 2);
  return words.length > 1 && words.some((word) => lowerText.includes(word.endsWith("s") ? word.slice(0, -1) : word));
}

function compressSentence(sentence) {
  const clean = sentence.replace(/\([^)]{35,}\)/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= 150) return clean;
  return `${clean.slice(0, 147).replace(/\s+\S*$/, "")}...`;
}
