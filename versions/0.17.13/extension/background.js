chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  if (details.reason === "update" && details.previousVersion === "0.16.3") {
    const saved = await chrome.storage.sync.get("scanMode");
    const update = { showV17Note: true };
    if (!saved.scanMode) update.scanMode = "scholarly";
    await chrome.storage.sync.set(update);
  }
  updatePauseBadge();
});

chrome.runtime.onStartup.addListener(updatePauseBadge);

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.get("tabResearchSettings").then(({ tabResearchSettings = {} }) => {
    delete tabResearchSettings[String(tabId)];
    return chrome.storage.session.set({ tabResearchSettings });
  }).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.eehPaused) updatePauseBadge();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-pause") return;
  const { eehPaused = false } = await chrome.storage.sync.get("eehPaused");
  const shouldPause = !eehPaused;
  await chrome.storage.sync.set({ eehPaused: shouldPause });
  if (shouldPause) {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.filter((tab) => tab.id).map((tab) =>
      chrome.tabs.sendMessage(tab.id, { type: "EEH_DISABLE" }).catch(() => {})
    ));
  }
});

async function updatePauseBadge() {
  const { eehPaused = false } = await chrome.storage.sync.get("eehPaused");
  await chrome.action.setBadgeText({ text: eehPaused ? "Ⅱ" : "" });
  if (eehPaused) {
    await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
    await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.sidePanel.open({ tabId: tab.id });
});
