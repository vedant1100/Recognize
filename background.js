/**
 * Meetlytics Background Service Worker (Manifest V3)
 *
 * KEY INSIGHT: chrome.tabCapture.getMediaStreamId() can ONLY be called
 * from the service worker when triggered by a user gesture on the
 * EXTENSION ICON (action click) — not from a content script button.
 *
 * Correct flow:
 * 1. User clicks the M button in Meet → content script sends START_RECORDING
 * 2. Background calls getMediaStreamId() for that tab
 * 3. Returns streamId to content script
 * 4. Content script uses getUserMedia({ chromeMediaSource: "tab", chromeMediaSourceId })
 */

// ── Handle toolbar icon click ────────────────────────────────────────────────
// This gives us the activeTab permission grant we need
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && tab.url.includes("meet.google.com")) {
    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" });
  }
});

// ── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "GET_STREAM_ID") {
    const tabId = sender.tab?.id;

    if (!tabId) {
      sendResponse({ success: false, error: "No tab ID" });
      return true;
    }

    // Make the tab active first — required for tabCapture
    chrome.tabs.update(tabId, { active: true }, () => {
      chrome.tabCapture.getMediaStreamId(
        { targetTabId: tabId },
        (streamId) => {
          if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message;
            console.error("[BG] getMediaStreamId failed:", err);
            sendResponse({ success: false, error: err });
          } else {
            console.log("[BG] streamId obtained:", streamId);
            sendResponse({ success: true, streamId });
          }
        }
      );
    });

    return true; // async
  }

  if (message.type === "SAVE_RECORDING") {
    const { dataUrl, filename, size } = message;

    chrome.downloads.download(
      { url: dataUrl, filename, saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("[BG] Download failed:", chrome.runtime.lastError.message);
        } else {
          console.log("[BG] Download started:", filename, downloadId);
        }
      }
    );

    // Notify content script
    chrome.tabs.query({ url: "https://meet.google.com/*" }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, {
          type: "RECORDING_SAVED",
          filename,
          sizeMb: (size / 1024 / 1024).toFixed(1),
        }).catch(() => {});
      });
    });
  }

});
