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

const t = (key, subs) => chrome.i18n.getMessage(key, subs);

// Display text for the category tags on result cards. The underlying values
// (result.confidence / result.evidenceType) stay English: they are logic keys
// (filtering, sorting, CSV values) and CSS tone classes. Only the visible
// label is translated. Unknown values render verbatim.
const TAG_TEXT = {
  high: "tag_high",
  medium: "tag_medium",
  low: "tag_low",
  reference: "tag_reference",
  "care guidance": "tag_care_guidance",
  relationship: "tag_relationship",
  "candidate evidence": "tag_candidate_evidence",
};
const tagText = (value) => (TAG_TEXT[value] ? t(TAG_TEXT[value]) : value);

// Localizes the static panel markup (labels, buttons, options, hints) from
// _locales. Chrome substitutes __MSG__ placeholders only in manifest.json and
// CSS files, not in HTML, so static HTML text is wired through data-i18n
// attributes (text), data-i18n-placeholder (placeholders) and
// data-i18n-aria-label (accessible labels) instead. The browser locale is
// selected automatically by chrome.i18n, falling back to the default locale.
function localizePanel() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const text = chrome.i18n.getMessage(el.dataset.i18n);
    if (text) el.textContent = text;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const text = chrome.i18n.getMessage(el.dataset.i18nPlaceholder);
    if (text) el.placeholder = text;
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const text = chrome.i18n.getMessage(el.dataset.i18nAriaLabel);
    if (text) el.setAttribute("aria-label", text);
  });
  document.title = chrome.i18n.getMessage("ext_name");
  document.documentElement.lang = chrome.i18n.getUILanguage();
}

init();

async function init() {
  localizePanel();
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
          ? t("status_search_updated_paused")
          : t("status_search_updated"));
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
    setStatus(t("status_scrolling"));
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
      eehPaused ? t("empty_auto_paused_title") : t("empty_manual_title"),
      eehPaused ? t("empty_auto_paused_msg") : t("empty_manual_msg_short"),
      [{ label: t("button_scan_page_once"), action: () => scanCurrentTab() }]
    );
    setStatus(eehPaused ? t("status_paused_saved") : t("status_manual_off"));
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
    const message = t("empty_unsupported_msg");
    setEmptyState(t("empty_unsupported_title"), message, [{ label: t("button_scan_pdf"), action: () => pdfFileInput.click() }]);
    setStatus(message);
    return;
  }
  if (looksLikeLocalPdfUrl(tab.url || "")) {
    const message = t("empty_localpdf_msg");
    setEmptyState(t("empty_localpdf_title"), message, [{ label: t("button_scan_pdf"), action: () => pdfFileInput.click() }]);
    setStatus(message);
    return;
  }
  setStatus(t("status_new_page_auto"));
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
    setStatus(t("status_new_page_prompt"));
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
  setStatus(t(auto ? "status_auto_scanning" : "status_scanning_visible"));
  scanButton.disabled = true;
  scanInProgress = true;

  try {
    let response;
    if (looksLikeLocalPdfUrl(tab.url || "")) {
      setStatus(t("status_local_pdf_viewer"));
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
        setStatus(t("status_trying_pdf_link"));
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
        ? t("status_pdf_scanned")
        : t("status_pdf_no_text"));
    } else if (currentResults.length && currentResults.every((result) => result.sourceType === "video_title")) {
      setStatus(t(currentResults.length === 1 ? "status_youtube_titles_one" : "status_youtube_titles_many", String(currentResults.length)));
    } else if (currentResults.length) {
      setStatus(t(currentResults.length === 1 ? "status_found_one" : "status_found_many", String(currentResults.length)));
    } else if ((response.pageTextLength || 0) < 50) {
      const bodyTextLength = response.pageBodyTextLength || 0;
      const hasVisiblePageText = bodyTextLength >= 50;
      const message = hasVisiblePageText
        ? t("empty_layout_msg")
        : t("empty_unreadable_msg");
      setEmptyState(hasVisiblePageText ? t("empty_layout_title") : t("empty_unreadable_title"), message, hasVisiblePageText ? [] : [
        { label: t("button_scan_pdf"), action: () => pdfFileInput.click() }
      ]);
      setStatus(message);
    } else {
      const isYouTubeResults = isYouTubeResultsPage(response.url || tab.url);
      const message = isYouTubeResults
        ? t("empty_youtube_msg")
        : t("empty_nomatch_msg");
      setEmptyState(isYouTubeResults ? t("empty_youtube_title") : t("empty_nomatch_title"), message);
      setStatus(message);
    }
  } catch (error) {
    if (/403|401|forbidden|unauthorized/i.test(error.message)) {
      const message = t("empty_pdf_denied_msg");
      setEmptyState(t("empty_pdf_denied_title"), message, [{ label: t("button_scan_pdf"), action: () => pdfFileInput.click() }]);
      setStatus(message);
    } else if (/cannot access contents|host permission|not allowed to access|permission to access this host/i.test(error.message)) {
      const message = t("empty_blocked_msg");
      setEmptyState(t("empty_blocked_title"), message, [{ label: t("button_scan_pdf"), action: () => pdfFileInput.click() }]);
      setStatus(message);
    } else {
      setEmptyState(t("empty_scan_failed_title"), t("empty_scan_failed_msg", error.message));
      setStatus(t("status_scan_failed", error.message));
    }
  } finally {
    scanInProgress = false;
    scanButton.disabled = false;
    if (eehPaused && !auto) setStatus(t("status_scanned_once_paused"));
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

  setEmptyState(t("paused_title"), t("empty_paused_cleared_msg"));
  setStatus(t("status_paused_cleared"));
}

async function resumeScanning() {
  await setPausedState(false);
  setStatus(t("status_resumed"));
  await resumeActivePage();
}

async function setPausedState(paused) {
  eehPaused = paused;
  await chrome.storage.sync.set({ eehPaused });
  updatePauseUi();
}

function confirmResumeForScan() {
  if (!pausedScanDialog?.showModal) {
    return Promise.resolve(window.confirm(t("confirm_resume_text")));
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
      t("empty_manual_title"),
      t("empty_manual_msg_long"),
      [{ label: t("button_scan_page_once"), action: () => scanCurrentTab() }]
    );
    setStatus(t("status_manual_off_generic"));
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
  pauseButton.textContent = eehPaused ? t("pause_button_resume") : t("pause_button_pause");
  scanStateEl.textContent = eehPaused ? t("scan_state_paused") : t("scan_state_on");
  scanStateEl.classList.toggle("paused", eehPaused);
  pauseButton.setAttribute("aria-pressed", String(eehPaused));
  scanButton.textContent = eehPaused ? t("button_scan_page_once") : t("button_scan_page");
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
    t("empty_scholarly_title"),
    t("empty_scholarly_msg"),
    [
      { label: t("button_scan_page_once"), action: () => scanCurrentTab() },
      { label: t("action_use_any_page"), action: () => { scanMode.value = "all"; saveScanMode(); } }
    ]
  );
  setStatus(t("status_skip_no_read"));
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
  setStatus(t("status_scanning_saved_pdf", file.name));

  try {
    const buffer = await file.arrayBuffer();
    const pages = await extractPdfPages(buffer);
    const text = pages.map((page) => page.text).join("\n\n");
    currentResults = scanPdfPages(pages, getSettings(), file.name, `local:${file.name}`);
    pageInfo = { title: file.name, url: `local:${file.name}`, isPdfLike: true };
    renderResults();
    if (currentResults.length) {
      setStatus(t("status_saved_pdf_scanned", text.length.toLocaleString()));
    } else if (text.length < 200) {
      setStatus(t("status_saved_pdf_no_text"));
    } else {
      setStatus(t("status_saved_pdf_no_candidates", text.length.toLocaleString()));
    }
  } catch (error) {
    setStatus(t("status_saved_pdf_failed", error.message));
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
  setStatus(t("status_cleared"));
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
    ? (currentResults.length > visibleResults.length ? t("count_shown_titles", String(currentResults.length)) : t("count_video_titles"))
    : (currentResults.length > visibleResults.length ? t("count_shown_candidates", String(currentResults.length)) : t("count_candidates"));
  exportButton.disabled = currentResults.length === 0;
  resultsEl.replaceChildren();

  if (currentResults.length > 0 && visibleResults.length === 0) {
    setEmptyState(
      t("empty_filter_title"),
      t(currentResults.length === 1 ? "empty_filter_msg_one" : "empty_filter_msg_many", [String(currentResults.length), confidenceFilter.selectedOptions[0]?.textContent || t("filter_fallback_label")]),
      [{
        label: t("action_show_all"),
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
      card.setAttribute("aria-label", t("aria_show_candidate", String(index + 1)));
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
      pill(tagText(result.confidence), result.confidence),
      pill(tagText(result.evidenceType)),
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
      line(t("field_short_summary"), result.summary),
      line(t("field_concepts"), result.concepts),
      line(t("field_matched"), result.matchedTerms?.join(", ") || t("value_na"))
    ];
    if (result.pageNumber) {
      detailLines.splice(1, 0, line(t("field_pdf_page"), result.pageNumber));
    }
    fieldsBlock.append(...detailLines);

    const action = document.createElement("div");
    if (result.canHighlight === false) {
      action.className = "pageNote";
      action.textContent = t("page_note_no_highlight");
    } else {
      const focusButton = document.createElement("button");
      focusButton.className = "cardButton";
      focusButton.textContent = t("button_show_highlight");
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
      setStatus(t("status_pdf_page_opened", String(result.pageNumber)));
    } else if (result.pageNumber) {
      setStatus(t("status_pdf_page_local", String(result.pageNumber)));
    } else {
      setStatus(t("status_pdf_no_jump"));
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
      setStatus(t("status_highlight_not_found"));
    }
  } catch {
    setStatus(t("status_highlight_jump_failed"));
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
  el.textContent = text || t("fallback_candidate");
  return el;
}

function line(label, value) {
  const el = document.createElement("div");
  el.textContent = `${label}: ${value || t("value_unknown")}`;
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
      if (!silent) setStatus(t("status_prefill_updated"));
      if (forceScan && suggestion.conceptOne && suggestion.conceptTwo) {
        await scanCurrentTab();
      }
    } else if (!silent && !canUsePageSuggestion && fields.question.value.trim()) {
      setStatus(t("status_saved_intent"));
    } else if (!silent && response.pdfLinks?.length) {
      setStatus(t(response.pdfLinks.length === 1 ? "status_pdf_links_one" : "status_pdf_links_many", String(response.pdfLinks.length)));
    }
    return changed;
  } catch {
    if (!silent) setStatus(t("status_no_query"));
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
    [t("field_short_summary"), t("csv_extracted_answer"), t("field_concepts"), t("field_pdf_page"), t("csv_evidence_type"), t("csv_confidence"), t("csv_evidence_sentence"), t("csv_page_title"), t("csv_url")]
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
  setStatus(t("status_fetching_pdf"));
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
    return food ? t("summary_food", [conceptOne, food]) : compressSentence(trimmed);
  }

  if (intent.kind === "guide") {
    const topic = extractGuideTopic(trimmed);
    return topic ? t("summary_care", topic) : compressSentence(trimmed);
  }

  if (conceptOne && conceptTwo) {
    const direction = inferDirection(trimmed);
    return t("summary_relation", [conceptOne, direction, conceptTwo]);
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
  if (/\b(higher|greater|more|increased|increase|positive|positively)\b/i.test(sentence)) return t("direction_increase");
  if (/\b(lower|less|decreased|decrease|reduced|negative|negatively)\b/i.test(sentence)) return t("direction_decrease");
  if (/\b(no|not|neither|unrelated|not associated|no association|no relationship)\b/i.test(sentence)) return t("direction_unclear");
  return t("direction_general");
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
