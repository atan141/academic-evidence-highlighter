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
const pauseButton = document.querySelector("#pauseButton");
const scanStateEl = document.querySelector("#scanState");
const scanMode = document.querySelector("#scanMode");
const upgradeNote = document.querySelector("#upgradeNote");
const dismissUpgradeNote = document.querySelector("#dismissUpgradeNote");
const statusEl = document.querySelector("#status");
const countEl = document.querySelector("#count");
const countCaptionEl = document.querySelector("#countCaption");
const resultsEl = document.querySelector("#results");
const emptyStateEl = document.querySelector("#emptyState");
const pausedScanDialog = document.querySelector("#pausedScanDialog");
const keepPausedButton = document.querySelector("#keepPausedButton");
const resumeAndScanButton = document.querySelector("#resumeAndScanButton");
const FIELD_KEYS = Object.keys(fields);
const UI_PREF_KEYS = ["sortMode", "confidenceFilter"];
const SCHOLARLY_DOMAINS = [
  "plos.org", "connectsci.au", "tandfonline.com", "sagepub.com", "frontiersin.org",
  "mdpi.com", "biorxiv.org", "medrxiv.org", "peerj.com", "cambridge.org",
  "academic.oup.com", "bmj.com", "thelancet.com", "nejm.org", "wiley.com",
  "nature.com", "springer.com", "sciencedirect.com", "jstor.org", "doi.org",
  "pubmed.ncbi.nlm.nih.gov", "semanticscholar.org", "arxiv.org"
];
const NON_SCHOLARLY_DOMAINS = [
  "facebook.com", "fb.com", "messenger.com", "instagram.com", "threads.net",
  "x.com", "twitter.com", "tiktok.com", "linkedin.com", "reddit.com",
  "whatsapp.com", "youtube.com", "youtu.be", "pinterest.com", "snapchat.com",
  "discord.com", "twitch.tv"
];

let currentResults = [];
let currentResultContextKey = "";
let pageInfo = {};
let tabResearchSettings = {};
let currentSettingsTabId = null;
let tabSettingsWriteQueue = Promise.resolve();
const closedTabIds = new Set();
let pdfjsLibPromise = null;
let lastAutoQuestion = "";
let refreshTimer = null;
let lastActiveUrl = "";
let lastActiveTabId = null;
let activePageGeneration = 0;
let autoScanInFlight = false;
let scanInProgress = false;
let pendingPageSuggestion = "";
let pendingPageSuggestionAt = 0;
let lastScrollScanAt = 0;
let scrollScanQueued = false;
let queuedScrollTabId = null;
let searchCheckInFlight = false;
let eehPaused = false;
let storedScanMode = "scholarly";

init();

async function init() {
  const [saved, sessionSaved] = await Promise.all([
    chrome.storage.sync.get([...FIELD_KEYS, ...UI_PREF_KEYS, "eehPaused", "scanMode", "showV17Note"]),
    chrome.storage.session.get("tabResearchSettings")
  ]);
  tabResearchSettings = sessionSaved.tabResearchSettings || {};
  Object.entries(fields).forEach(([key, input]) => {
    input.value = saved[key] || "";
    input.addEventListener("input", saveSettings);
  });
  sortMode.value = saved.sortMode || "order";
  confidenceFilter.value = saved.confidenceFilter && saved.confidenceFilter !== "all"
    ? saved.confidenceFilter
    : "noReferences";
  eehPaused = Boolean(saved.eehPaused);
  storedScanMode = ["scholarly", "all", "manual"].includes(saved.scanMode) ? saved.scanMode : "scholarly";
  scanMode.value = storedScanMode;
  if (saved.showV17Note) upgradeNote.hidden = false;

  scanButton.addEventListener("click", scanCurrentTab);
  pauseButton.addEventListener("click", togglePause);
  keepPausedButton.addEventListener("click", () => pausedScanDialog.close("stay"));
  resumeAndScanButton.addEventListener("click", () => pausedScanDialog.close("resume"));
  scanMode.addEventListener("change", saveScanMode);
  dismissUpgradeNote.addEventListener("click", async () => {
    upgradeNote.hidden = true;
    await chrome.storage.sync.set({ showV17Note: false });
  });
  scanFileButton.addEventListener("click", async () => {
    if (eehPaused) {
      if (!await confirmResumeForScan()) return;
      await setPausedState(false);
    }
    pdfFileInput.click();
  });
  pdfFileInput.addEventListener("change", scanSelectedPdf);
  clearButton.addEventListener("click", clearAll);
  exportButton.addEventListener("click", exportCsv);
  sortMode.addEventListener("change", saveUiPreferencesAndRender);
  confidenceFilter.addEventListener("change", saveUiPreferencesAndRender);
  chrome.storage.onChanged.addListener(handleStorageChange);
  chrome.tabs.onRemoved.addListener(handleTabRemoved);
  chrome.tabs.onActivated.addListener(handleTabActivated);
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === "EEH_SCROLL_ACTIVITY") handleContentScroll(sender);
  });
  updatePauseUi();
  const initialTab = await getActiveTab();
  if (initialTab?.url) await handleActivePageChanged(initialTab);
  await rememberActiveUrl();
  startSearchWatcher();
  startTabWatcher();
}

async function saveSettings() {
  const settings = getSettings();
  const tabId = currentSettingsTabId;
  await chrome.storage.sync.set(settings);
  if (tabId !== null) await rememberTabResearchSettings(tabId, settings);
}

function rememberTabResearchSettings(tabId, settings) {
  const key = String(tabId);
  if (closedTabIds.has(key)) return Promise.resolve();
  tabResearchSettings[key] = { ...settings };
  tabSettingsWriteQueue = tabSettingsWriteQueue
    .catch(() => {})
    .then(() => chrome.storage.session.set({ tabResearchSettings }));
  return tabSettingsWriteQueue;
}

async function handleTabRemoved(tabId) {
  const key = String(tabId);
  closedTabIds.add(key);
  delete tabResearchSettings[key];
  tabSettingsWriteQueue = tabSettingsWriteQueue
    .catch(() => {})
    .then(() => chrome.storage.session.set({ tabResearchSettings }));
  await tabSettingsWriteQueue;
}

async function handleTabActivated(activeInfo) {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const activeTab = await getActiveTab();
    if (activeTab?.id !== tab.id) return;
    lastActiveUrl = tab.url || "";
    lastActiveTabId = tab.id;
    await handleActivePageChanged(tab);
  } catch {
    // Ignore transient tab activation races while Chrome changes windows.
  }
}

function restoreResearchSettings(settings) {
  Object.entries(fields).forEach(([key, input]) => {
    input.value = settings?.[key] || "";
  });
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
  refreshTimer = window.setInterval(async () => {
    if (searchCheckInFlight) return;
    searchCheckInFlight = true;
    try {
      const tab = await getActiveTab();
      if (!tab?.id || eehPaused || !isAutomaticScanningAllowed(storedScanMode) || isUnsupportedUrl(tab.url || "")) return;
      if (storedScanMode === "scholarly" && !await isAutomaticPage(tab, storedScanMode)) {
        pendingPageSuggestion = "";
        return;
      }
      const response = await sendPageMessage(tab.id, "EEH_SUGGEST", { expectedUrl: tab.url }, tab.url);
      if (response?.skipped) return;
      const stillActive = await getActiveTab();
      if (stillActive?.id !== tab.id || stillActive?.url !== tab.url) return;
      const suggestion = response.suggestion || {};
      const query = suggestion.question?.trim() || "";
      if (!query || !["search_input", "url_query"].includes(suggestion.source) || query === lastAutoQuestion) {
        pendingPageSuggestion = "";
        return;
      }
      if (query !== pendingPageSuggestion) {
        pendingPageSuggestion = query;
        pendingPageSuggestionAt = Date.now();
        return;
      }
      if (Date.now() - pendingPageSuggestionAt < 900) return;

      pendingPageSuggestion = "";
      const changed = await prefillFromPage({ forceScan: false, silent: true, clearResultsOnChange: true, expectedTab: tab });
      const activeAfterPrefill = await getActiveTab();
      if (activeAfterPrefill?.id !== tab.id || activeAfterPrefill?.url !== tab.url) return;
      lastAutoQuestion = query;
      if (changed && !eehPaused && isAutomaticScanningAllowed(storedScanMode)) {
        await autoScanCurrentTab();
      } else if (changed) {
        clearEmptyState();
        setStatus(eehPaused
          ? "Updated the research question from this page’s search. Automatic scanning is paused; click Scan this page once to scan."
          : "Updated the research question from this page’s search. Click Scan page when you’re ready.");
      }
    } catch {
      // Ignore tabs which do not expose a page to extension scripts.
    } finally {
      searchCheckInFlight = false;
    }
  }, 800);
}

async function handleContentScroll(sender) {
  if (!sender.tab?.id || eehPaused || !isAutomaticScanningAllowed(storedScanMode)) return;
  try {
    const activeTab = await getActiveTab();
    if (!activeTab?.id || activeTab.id !== sender.tab.id) return;
    if (storedScanMode === "scholarly" && !await isAutomaticPage(activeTab, storedScanMode)) return;
    if (isUnsupportedUrl(activeTab.url || "") || looksLikeLocalPdfUrl(activeTab.url || "")) return;
    if (autoScanInFlight || scanInProgress) {
      scrollScanQueued = true;
      queuedScrollTabId = sender.tab.id;
      return;
    }
    if (Date.now() - lastScrollScanAt < 1000) return;
    lastScrollScanAt = Date.now();
    setStatus("Scanning the loaded page content. Keep scrolling to load more; results from earlier content stay here.");
    await autoScanCurrentTab();
  } catch {
    // Ignore transient tab changes while scrolling.
  }
}

function startTabWatcher() {
  window.setInterval(async () => {
    try {
      const tab = await getActiveTab();
      const url = tab?.url || "";
      if (!url || (url === lastActiveUrl && tab.id === lastActiveTabId)) return;
      lastActiveUrl = url;
      lastActiveTabId = tab.id;
      await handleActivePageChanged(tab);
    } catch {
      // Ignore transient tab states while Chrome is navigating.
    }
  }, 1200);
}

async function rememberActiveUrl() {
  const tab = await getActiveTab();
  lastActiveUrl = tab?.url || "";
  lastActiveTabId = tab?.id || null;
}

async function handleActivePageChanged(tab) {
  const generation = ++activePageGeneration;
  if (!tab?.id) return;
  const outgoingTabId = currentSettingsTabId;
  const outgoingSettings = getSettings();
  if (outgoingTabId !== null) await rememberTabResearchSettings(outgoingTabId, outgoingSettings);
  if (generation !== activePageGeneration) return;
  currentSettingsTabId = tab.id;
  const restoredSettings = tabResearchSettings[String(tab.id)];
  if (restoredSettings) {
    restoreResearchSettings(restoredSettings);
    lastAutoQuestion = restoredSettings.question || "";
    await chrome.storage.sync.set(restoredSettings);
  } else {
    await rememberTabResearchSettings(tab.id, getSettings());
  }
  if (generation !== activePageGeneration) return;
  currentResults = [];
  currentResultContextKey = "";
  pageInfo = { title: tab?.title || "", url: tab?.url || "", isPdfLike: looksLikePdfUrl(tab?.url || "") };
  renderResults();
  if (eehPaused || !isAutomaticScanningAllowed(storedScanMode)) {
    setEmptyState(
      eehPaused ? "Automatic scanning is paused" : "Automatic scanning is set to manual",
      eehPaused ? "This page has not been read for scanning. Your research question is saved." : "This page is not read unless you choose Scan page.",
      [{ label: "Scan this page once", action: () => scanCurrentTab() }]
    );
    setStatus(eehPaused ? "Scanning is paused. Your research question is saved." : "Automatic scanning is off for this page. Click Scan page to scan it once.");
    return;
  }
  if (storedScanMode === "scholarly") {
    const autoEligible = await isAutomaticPage(tab, storedScanMode);
    if (generation !== activePageGeneration) return;
    if (!autoEligible) {
      currentResults = [];
      currentResultContextKey = "";
      pendingPageSuggestion = "";
      renderResults();
      // Clear any marks left by an earlier extension version without injecting
      // a script or asking the page for content.
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "EEH_DISABLE" });
      } catch {
        // No page reader is installed on this page; nothing needs clearing.
      }
      if (generation !== activePageGeneration) return;
      showScholarlyPageSkipped();
      return;
    }
  }

  if (!isUnsupportedUrl(tab.url || "") && !looksLikeLocalPdfUrl(tab.url || "")) {
    const activeBeforeRead = await getActiveTab();
    if (generation !== activePageGeneration || activeBeforeRead?.id !== tab.id || activeBeforeRead?.url !== tab.url) return;
    await prefillFromPage({ forceScan: false, silent: true, expectedTab: tab });
    if (generation !== activePageGeneration) return;
    try {
      const activeBeforeCache = await getActiveTab();
      if (activeBeforeCache?.id !== tab.id || activeBeforeCache?.url !== tab.url) return;
      const cached = await sendPageMessage(tab.id, "EEH_GET_CACHED_RESULTS", { expectedUrl: tab.url }, tab.url);
      if (generation !== activePageGeneration) return;
      if (cached?.results?.length) {
        currentResults = cached.results;
        currentResultContextKey = JSON.stringify({ tabId: tab.id, url: tab.url, settings: getSettings() });
        pageInfo = { title: cached.title, url: cached.url, isPdfLike: cached.isPdfLike };
        renderResults();
      }
    } catch {
      // The page may not allow content-script access.
    }
  }
  clearEmptyState();
  if (isUnsupportedUrl(tab.url || "")) {
    const message = "Chrome does not allow extensions to read this kind of page (for example, Chrome settings or the Chrome Web Store). Open the article in a regular webpage, or download its PDF and use Scan saved PDF.";
    setEmptyState("Chrome does not allow scanning this page", message, [{ label: "Scan saved PDF", action: () => pdfFileInput.click() }]);
    setStatus(message);
    return;
  }
  if (looksLikeLocalPdfUrl(tab.url || "")) {
    const message = "Chrome’s built-in PDF viewer does not expose its text to this extension. Download the PDF, then choose it with Scan saved PDF.";
    setEmptyState("This PDF viewer can’t be scanned directly", message, [{ label: "Scan saved PDF", action: () => pdfFileInput.click() }]);
    setStatus(message);
    return;
  }
  setStatus("New page detected. Auto-scanning with the current research question...");
  await autoScanCurrentTab();
}

async function autoScanCurrentTab() {
  if (eehPaused || !isAutomaticScanningAllowed(storedScanMode) || autoScanInFlight) return;
  const activeTab = await getActiveTab();
  if (!activeTab?.id) return;
  const autoEligible = await isAutomaticPage(activeTab, storedScanMode);
  const stillActive = await getActiveTab();
  if (stillActive?.id !== activeTab.id) return;
  if (!autoEligible) {
    showScholarlyPageSkipped();
    return;
  }
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
    if (scrollScanQueued && queuedScrollTabId) {
      const tabId = queuedScrollTabId;
      scrollScanQueued = false;
      queuedScrollTabId = null;
      window.setTimeout(() => handleContentScroll({ tab: { id: tabId } }), 150);
    }
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function scanCurrentTab(options = {}) {
  const { auto = false } = options;
  if (auto && (eehPaused || !isAutomaticScanningAllowed(storedScanMode))) return;
  if (!auto && eehPaused) {
    const confirmed = await confirmResumeForScan();
    if (!confirmed) return;
    await setPausedState(false);
  }
  let tab = await getActiveTab();
  if (!tab?.id) return;
  const scanModeAtStart = storedScanMode;
  if (auto) {
    const eligible = await isAutomaticPage(tab, scanModeAtStart);
    const activeAfterCheck = await getActiveTab();
    if (activeAfterCheck?.id !== tab.id || eehPaused || storedScanMode !== scanModeAtStart) return;
    if (!eligible) {
      showScholarlyPageSkipped();
      return;
    }
  }
  await prefillFromPage({ forceScan: false, silent: true });
  let activeAfterPrefill = await getActiveTab();
  if (activeAfterPrefill?.id !== tab.id || (auto && (eehPaused || storedScanMode !== scanModeAtStart))) return;
  if (auto) {
    const eligible = await isAutomaticPage(activeAfterPrefill, scanModeAtStart);
    const activeAtDispatch = await getActiveTab();
    if (activeAtDispatch?.id !== activeAfterPrefill.id
      || activeAtDispatch?.url !== activeAfterPrefill.url
      || eehPaused
      || storedScanMode !== scanModeAtStart) return;
    if (!eligible) {
      showScholarlyPageSkipped();
      return;
    }
  }
  tab = activeAfterPrefill;
  await saveSettings();
  clearEmptyState();
  setStatus(auto ? "Auto-scanning this page..." : "Scanning visible article text...");
  scanButton.disabled = true;
  scanInProgress = true;

  try {
    let response;
    if (looksLikeLocalPdfUrl(tab.url || "")) {
      setStatus("Chrome is showing a local PDF viewer. Use Scan saved PDF to choose the downloaded file directly.");
      return;
    } else if (looksLikePdfUrl(tab.url || "")) {
      response = await scanPdfUrl(tab.url, tab.title || "PDF");
    } else {
      const allowScroll = auto || (!eehPaused
        && isAutomaticScanningAllowed(storedScanMode)
        && await isAutomaticPage(tab, storedScanMode));
      response = await sendPageMessage(tab.id, "EEH_SCAN", auto
        ? { automatic: true, expectedUrl: tab.url, allowScroll: true }
        : { explicitScan: true, expectedUrl: tab.url, allowScroll }, tab.url);
      if (response?.skipped) return;
      if ((!response.results || response.results.length === 0) && response.pdfLinks?.length) {
        setStatus("No page-text matches. Trying the first PDF link...");
        response = await scanPdfUrl(response.pdfLinks[0], response.title || tab.title || "PDF");
      }
    }

    if (auto && eehPaused) {
      await clearPageHighlightsOnly();
      return;
    }
    const stillActive = await getActiveTab();
    if (stillActive?.id !== tab.id) return;

    const resultContextKey = JSON.stringify({ tabId: tab.id, url: tab.url, settings: getSettings() });
    if (resultContextKey !== currentResultContextKey) {
      currentResults = [];
      currentResultContextKey = resultContextKey;
    }
    currentResults = mergeCandidateResults(currentResults, response.results || []);
    pageInfo = { title: response.title, url: response.url, isPdfLike: response.isPdfLike };
    renderResults();

    if (pageInfo.isPdfLike) {
      setStatus(currentResults.length
        ? "Scanned PDF text. Built-in PDF viewers cannot be highlighted yet, so review the evidence cards here."
        : "Could not extract useful PDF text. Some journal PDFs are protected, image-only, or compressed beyond this prototype.");
    } else if (currentResults.length && currentResults.every((result) => result.sourceType === "video_title")) {
      setStatus(`Found ${currentResults.length} YouTube video title${currentResults.length === 1 ? "" : "s"} matching your terms. Titles are not evidence; open a video description or transcript to scan study content.`);
    } else if (currentResults.length) {
      setStatus(`Scanned the content loaded so far and found ${currentResults.length} candidate sentence${currentResults.length === 1 ? "" : "s"}. On feeds, keep scrolling to load and scan more; earlier results stay here. Verify each candidate.`);
    } else if ((response.pageTextLength || 0) < 50) {
      const bodyTextLength = response.pageBodyTextLength || 0;
      const hasVisiblePageText = bodyTextLength >= 50;
      const message = hasVisiblePageText
        ? "The browser page contains visible text, but the scanner could not separate it into readable text blocks. This site’s layout is not fully supported yet; this is an extension compatibility limitation, not proof that Chrome blocked access. Try selecting and copying the text into a document or opening a simpler text view."
        : "The extension could not read text from this page. Chrome or the site may restrict access, or the page may use a protected viewer or frame. If this is an article, try its full-text page or download the PDF and use Scan saved PDF.";
      setEmptyState(hasVisiblePageText ? "This page layout is not supported yet" : "The extension could not read this page", message, hasVisiblePageText ? [] : [
        { label: "Scan saved PDF", action: () => pdfFileInput.click() }
      ]);
      setStatus(message);
    } else {
      const isYouTubeResults = isYouTubeResultsPage(response.url || tab.url);
      const message = isYouTubeResults
        ? "YouTube search results mainly contain video titles. None matched your current terms strongly enough to show. Titles are not evidence; open a video description or transcript and scan that text for study findings."
        : "The text loaded so far was readable, but no sentences matched your current question and concepts. On feeds or pages that load content as you scroll, keep scrolling to load more; the extension will scan new content and keep earlier results. You can also try broader terms.";
      setEmptyState(isYouTubeResults ? "No matching YouTube video titles" : "No matching candidate sentences", message);
      setStatus(message);
    }
  } catch (error) {
    if (/403|401|forbidden|unauthorized/i.test(error.message)) {
      const message = "The PDF server denied access to the extension, so it couldn’t read this file in the tab. Download the PDF and use Scan saved PDF instead.";
      setEmptyState("The PDF server blocked access", message, [{ label: "Scan saved PDF", action: () => pdfFileInput.click() }]);
      setStatus(message);
    } else if (/cannot access contents|host permission|not allowed to access|permission to access this host/i.test(error.message)) {
      const message = "Chrome blocked the extension from reading this site. Open chrome://extensions, find Academic Evidence Highlighter, choose Details → Site access, then allow access on this site. You can also download the article PDF and use Scan saved PDF.";
      setEmptyState("Chrome did not allow access to this page", message, [{ label: "Scan saved PDF", action: () => pdfFileInput.click() }]);
      setStatus(message);
    } else {
      setEmptyState("This page could not be scanned", `The extension could not read the page (${error.message}). If this is an article, try its full-text page or download the PDF and use Scan saved PDF.`);
      setStatus(`Could not scan this tab: ${error.message}`);
    }
  } finally {
    scanInProgress = false;
    scanButton.disabled = false;
    if (eehPaused && !auto) setStatus("Scanned this page once. Automatic scanning is still paused.");
    if (!autoScanInFlight && scrollScanQueued && queuedScrollTabId) {
      const tabId = queuedScrollTabId;
      scrollScanQueued = false;
      queuedScrollTabId = null;
      window.setTimeout(() => handleContentScroll({ tab: { id: tabId } }), 150);
    }
  }
}

async function togglePause() {
  if (eehPaused) {
    await resumeScanning();
    return;
  }
  await pauseScanning();
}

async function pauseScanning() {
  await setPausedState(true);
  await clearPausedScanState();
}

async function clearPausedScanState() {
  currentResults = [];
  currentResultContextKey = "";
  renderResults();
  clearEmptyState();

  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((tab) => tab.id).map(async (tab) => {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "EEH_DISABLE" });
    } catch {
      // No page reader is loaded for this tab, so there is nothing to clear.
    }
  }));

  setEmptyState("Scanning is paused", "Current results and page highlights were cleared. Resume scanning to scan eligible pages again.");
  setStatus("Scanning paused. Current results and page highlights were cleared.");
}

async function resumeScanning() {
  await setPausedState(false);
  setStatus("Scanning resumed. Checking this page now...");
  await resumeActivePage();
}

async function setPausedState(paused) {
  eehPaused = paused;
  await chrome.storage.sync.set({ eehPaused });
  updatePauseUi();
}

function confirmResumeForScan() {
  if (!pausedScanDialog?.showModal) {
    return Promise.resolve(window.confirm("Scanning is paused. Resume scanning and scan this page now? This will turn off Pause scanning."));
  }
  return new Promise((resolve) => {
    const onClose = () => resolve(pausedScanDialog.returnValue === "resume");
    pausedScanDialog.returnValue = "";
    pausedScanDialog.addEventListener("close", onClose, { once: true });
    pausedScanDialog.showModal();
    resumeAndScanButton.focus();
  });
}

async function saveScanMode() {
  storedScanMode = scanMode.value;
  await chrome.storage.sync.set({ scanMode: storedScanMode });
  lastActiveUrl = "";
  if (storedScanMode === "manual") {
    currentResults = [];
    currentResultContextKey = "";
    renderResults();
    const activeTab = await getActiveTab();
    if (activeTab?.id) {
      try {
        await chrome.tabs.sendMessage(activeTab.id, { type: "EEH_DISABLE" });
      } catch {
        // A page reader is not loaded on this tab.
      }
    }
    setEmptyState(
      "Automatic scanning is set to manual",
      "The extension will not read pages until you click Scan page. Your research question and concepts stay saved.",
      [{ label: "Scan this page once", action: () => scanCurrentTab() }]
    );
    setStatus("Automatic scanning is off. Click Scan page whenever you want to scan.");
    return;
  }
  const tab = await getActiveTab();
  if (tab?.url) {
    lastActiveUrl = tab.url;
    lastActiveTabId = tab.id;
    await handleActivePageChanged(tab);
  }
}

function updatePauseUi() {
  pauseButton.textContent = eehPaused ? "Resume scanning" : "Pause scanning";
  scanStateEl.textContent = eehPaused ? "Paused" : "Scanning on";
  scanStateEl.classList.toggle("paused", eehPaused);
  pauseButton.setAttribute("aria-pressed", String(eehPaused));
  scanButton.textContent = eehPaused ? "Scan this page once" : "Scan page";
}

function handleStorageChange(changes, areaName) {
  if (areaName !== "sync") return;
  if (changes.eehPaused) {
    const wasPaused = eehPaused;
    eehPaused = Boolean(changes.eehPaused.newValue);
    updatePauseUi();
    if (eehPaused && !wasPaused) clearPausedScanState();
    if (!eehPaused && wasPaused) resumeActivePage();
  }
  if (changes.scanMode && ["scholarly", "all", "manual"].includes(changes.scanMode.newValue)) {
    storedScanMode = changes.scanMode.newValue;
    scanMode.value = storedScanMode;
  }
}

async function resumeActivePage() {
  lastActiveUrl = "";
  const tab = await getActiveTab();
  if (!tab?.url) return;
  lastActiveUrl = tab.url;
  lastActiveTabId = tab.id;
  await handleActivePageChanged(tab);
}

function isAutomaticScanningAllowed(mode) {
  return mode !== "manual";
}

function showScholarlyPageSkipped() {
  setEmptyState(
    "This page wasn’t recognized as scholarly",
    "Scholarly pages only is on, so the extension did not read or scan this page. The address may still belong to an article that our checks don’t recognize. Choose Scan this page once only if you want to scan it, or switch Automatic scanning to Any page.",
    [
      { label: "Scan this page once", action: () => scanCurrentTab() },
      { label: "Use Any page", action: () => { scanMode.value = "all"; saveScanMode(); } }
    ]
  );
  setStatus("Automatic scan skipped without reading this page. Choose Scan this page once if you want to scan it.");
}

async function isAutomaticPage(tab, mode) {
  if (mode === "all") return true;
  if (mode === "manual") return false;
  const url = tab.url || "";
  if (isKnownNonScholarlyUrl(url)) return false;
  return looksScholarly(url);
}

function isKnownNonScholarlyUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return NON_SCHOLARLY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function looksScholarly(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`.toLowerCase();
    if (isKnownNonScholarlyUrl(url)) return false;
    if (SCHOLARLY_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
    return /(^|\.)scholar\.google\./.test(host)
      || /(^|\.)oup\.com$/.test(host)
      || /(^|\.)(?:edu|ac\.uk|ac\.au|edu\.au|ac\.nz|ac\.jp|edu\.cn|ac\.kr)$/.test(host)
      || /\.pdf(?:$|[?#])/i.test(path)
      || /\/(?:doi|article|articles|article-abstract|abstract|fulltext|full-text|paper|papers|journal|journals|publication|publications)(?:\/|[-?#]|$)/i.test(path)
        && /\.(?:org|edu|ac\.[a-z]{2,}|edu\.[a-z]{2,})$/i.test(host);
  } catch {
    return false;
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
  if (currentSettingsTabId !== null) await rememberTabResearchSettings(currentSettingsTabId, getSettings());
  currentResults = [];
  currentResultContextKey = "";
  renderResults();
  setStatus("Cleared search fields, results, and page highlights.");
}

function mergeCandidateResults(existing, incoming) {
  const merged = new Map();
  const keyFor = (result) => `${result.pageNumber || ""}|${(result.sentence || "").replace(/\s+/g, " ").trim().toLowerCase()}`;
  const incomingKeys = new Set(incoming.map(keyFor));
  existing.forEach((result, index) => {
    const key = keyFor(result);
    merged.set(key, { ...result, canHighlight: incomingKeys.has(key) ? result.canHighlight : false, order: index });
  });
  incoming.forEach((result) => {
    const key = keyFor(result);
    const previous = merged.get(key);
    merged.set(key, previous
      ? { ...previous, ...result, order: previous.order }
      : { ...result, order: merged.size });
  });
  return [...merged.values()];
}

function renderResults() {
  const visibleResults = getVisibleResults();
  countEl.textContent = String(visibleResults.length);
  const titleOnlyResults = currentResults.length > 0 && currentResults.every((result) => result.sourceType === "video_title");
  countCaptionEl.textContent = titleOnlyResults
    ? (currentResults.length > visibleResults.length ? `shown of ${currentResults.length} video titles (not evidence)` : "video titles (not evidence)")
    : (currentResults.length > visibleResults.length ? `shown of ${currentResults.length} candidate sentences` : "candidate sentences");
  exportButton.disabled = currentResults.length === 0;
  resultsEl.replaceChildren();

  if (currentResults.length > 0 && visibleResults.length === 0) {
    setEmptyState(
      "Matches were found, but the current filter is hiding them",
      `The scan found ${currentResults.length} candidate sentence${currentResults.length === 1 ? "" : "s"}. Your Show filter is set to “${confidenceFilter.selectedOptions[0]?.textContent || "a limited view"},” which hides all of them. Show all including references to view every match.`,
      [{
        label: "Show all matches",
        action: () => {
          confidenceFilter.value = "allWithReferences";
          saveUiPreferencesAndRender();
        }
      }]
    );
  } else if (visibleResults.length > 0) {
    clearEmptyState();
  }

  visibleResults.forEach((result, index) => {
    const card = document.createElement("article");
    card.className = "result";
    if (result.canHighlight !== false) {
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
    }

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

    const action = document.createElement("div");
    if (result.canHighlight === false) {
      action.className = "pageNote";
      action.textContent = "Text scanned from the page. In-page highlighting isn’t available for this layout.";
    } else {
      const focusButton = document.createElement("button");
      focusButton.className = "cardButton";
      focusButton.textContent = "Show highlight";
      focusButton.addEventListener("click", (event) => {
        event.stopPropagation();
        focusResult(result);
      });
      action.append(focusButton);
    }

    if (answerChips.childElementCount) card.append(meta, answerChips, sentence, fieldsBlock, action);
    else card.append(meta, sentence, fieldsBlock, action);
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

function isYouTubeResultsPage(url = "") {
  try {
    const parsed = new URL(url);
    return (parsed.hostname === "youtube.com" || parsed.hostname.endsWith(".youtube.com"))
      && parsed.pathname.startsWith("/results");
  } catch {
    return false;
  }
}

function setEmptyState(title, message, actions = []) {
  const heading = document.createElement("strong");
  heading.textContent = title;
  const description = document.createElement("p");
  description.textContent = message;
  emptyStateEl.replaceChildren(heading, description);
  if (actions.length) {
    const actionRow = document.createElement("div");
    actionRow.className = "emptyStateActions";
    actions.forEach(({ label, action }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", action);
      actionRow.append(button);
    });
    emptyStateEl.append(actionRow);
  }
  emptyStateEl.hidden = false;
}

function clearEmptyState() {
  emptyStateEl.hidden = true;
  emptyStateEl.replaceChildren();
}

async function prefillFromPage(options = {}) {
  const { forceScan = true, silent = false, clearResultsOnChange = false, expectedTab = null } = options;
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return false;
    if (expectedTab && (tab.id !== expectedTab.id || tab.url !== expectedTab.url)) return false;

    const expectedUrl = expectedTab?.url || tab.url;
    const response = await sendPageMessage(tab.id, "EEH_SUGGEST", { expectedUrl }, expectedUrl);
    if (response?.skipped) return false;
    const stillActive = await getActiveTab();
    if (stillActive?.id !== tab.id || stillActive?.url !== expectedUrl) return false;
    const suggestion = response.suggestion || {};
    let changed = false;

    const canUsePageSuggestion = ["search_input", "url_query"].includes(suggestion.source);
    const currentQuestion = fields.question.value.trim();
    const isNewPageSearch = canUsePageSuggestion
      && suggestion.question
      && suggestion.question !== lastAutoQuestion
      && currentQuestion !== suggestion.question;

    Object.entries(fields).forEach(([key, input]) => {
      if (isNewPageSearch) {
        const nextValue = suggestion[key] || "";
        if (input.value.trim() !== nextValue) {
          input.value = nextValue;
          changed = true;
        }
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
        currentResultContextKey = "";
        renderResults();
        clearEmptyState();
      }
      if (!silent) setStatus("Updated the research question and concepts from this page’s search. You can edit them or scan now.");
      if (forceScan && suggestion.conceptOne && suggestion.conceptTwo) {
        await scanCurrentTab();
      }
    } else if (!silent && !canUsePageSuggestion && fields.question.value.trim()) {
      setStatus("Using your saved search intent. Page titles will not replace your concepts.");
    } else if (!silent && response.pdfLinks?.length) {
      setStatus(`Found ${response.pdfLinks.length} PDF link(s). This prototype can detect them, but it cannot yet read protected PDF viewers directly.`);
    }
    return changed;
  } catch {
    if (!silent) setStatus("I couldn’t read a search query from this page. Enter a research question or click Scan page to scan with your saved terms.");
    return false;
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

async function sendPageMessage(tabId, type, extra = {}, expectedUrl = extra.expectedUrl || "") {
  const isExpectedPage = async () => {
    if (!expectedUrl) return true;
    try {
      return (await chrome.tabs.get(tabId))?.url === expectedUrl;
    } catch {
      return false;
    }
  };
  if (!await isExpectedPage()) return { ok: false, skipped: true };
  try {
    return await chrome.tabs.sendMessage(tabId, {
      type,
      settings: getSettings(),
      ...extra
    });
  } catch (error) {
    if (!await isExpectedPage()) return { ok: false, skipped: true };
    await injectContentScript(tabId);
    if (!await isExpectedPage()) {
      try { await chrome.tabs.sendMessage(tabId, { type: "EEH_DISABLE" }); } catch {}
      return { ok: false, skipped: true };
    }
    return chrome.tabs.sendMessage(tabId, {
      type,
      settings: getSettings(),
      ...extra
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
  const marker = "\u0000";
  const abbreviations = /\b(?:e\.g|i\.e|et al|fig|eq|dr|prof|vs|no|inc|approx|dept|vol|pp)\./gi;
  const protectedText = text.replace(/\s+/g, " ").replace(abbreviations, (match) => match.replaceAll(".", marker));
  return protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(])/)
    .map((sentence) => sentence.replaceAll(marker, ".").trim())
    .filter((sentence) => sentence.length >= 20 && sentence.length <= 800);
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
  if (matchesTermBoundary(lowerText, normalized)) return true;
  if (normalized.endsWith("s") && matchesTermBoundary(lowerText, normalized.slice(0, -1))) return true;
  const words = normalized.split(/\s+/).filter((word) => word.length > 2);
  return words.length > 1 && words.some((word) => matchesTermBoundary(lowerText, word.endsWith("s") ? word.slice(0, -1) : word));
}

function matchesTermBoundary(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "u").test(text);
}

function compressSentence(sentence) {
  const clean = sentence.replace(/\([^)]{35,}\)/g, "").replace(/\s+/g, " ").trim();
  if (clean.length <= 150) return clean;
  return `${clean.slice(0, 147).replace(/\s+\S*$/, "")}...`;
}
