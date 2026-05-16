const DEFAULT_WS_URL = "ws://localhost:8765/ws";
let offscreenReady = false;
let running = false;
let connected = false;
let activeTabId = null;

async function ensureContentOverlayInjected(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "PING_CONTENT" }).catch(() => null);
    if (ping && ping.loaded) {
      return;
    }
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (_err) {
    // Best effort; stream can still run without overlay.
  }
}

async function ensureOffscreenDocument() {
  const url = chrome.runtime.getURL("offscreen.html");

  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
      offscreenReady = true;
      return;
    }
  }

  await chrome.offscreen.createDocument({
    url,
    reasons: ["USER_MEDIA"],
    justification: "Capture a tab stream and encode JPEG frames for local WebSocket streaming."
  });
  offscreenReady = true;
}

async function getCurrentTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length || tabs[0].id === undefined) {
    throw new Error("No active tab found.");
  }
  return tabs[0].id;
}

async function startCapture(wsUrl) {
  await ensureOffscreenDocument();

  const tabId = await getCurrentTabId();
  activeTabId = tabId;
  await ensureContentOverlayInjected(tabId);
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_START",
    streamId,
    wsUrl: wsUrl || DEFAULT_WS_URL
  });

  running = true;
  notifyState();
}

async function stopCapture() {
  await chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" });
  running = false;
  connected = false;
  notifyState();
}

function notifyState(extra = {}) {
  chrome.runtime.sendMessage({
    type: "STATE",
    running,
    connected,
    ...extra
  }).catch(() => {
    // Popup may not be open.
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "UI_START") {
      try {
        await startCapture(msg.wsUrl);
        sendResponse({ ok: true });
      } catch (err) {
        running = false;
        connected = false;
        notifyState({ error: String(err?.message || err) });
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
      return;
    }

    if (msg.type === "UI_STOP") {
      try {
        await stopCapture();
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
      return;
    }

    if (msg.type === "UI_GET_STATE") {
      sendResponse({ running, connected, defaultWsUrl: DEFAULT_WS_URL });
      return;
    }

    if (msg.type === "OFFSCREEN_STATUS") {
      if (typeof msg.running === "boolean") {
        running = msg.running;
      }
      if (typeof msg.connected === "boolean") {
        connected = msg.connected;
      }
      notifyState({ error: msg.error || null });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "OFFSCREEN_WORD") {
      chrome.runtime.sendMessage({ type: "WORD", payload: msg.payload }).catch(() => {});
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "OFFSCREEN_TRACKS") {
      if (activeTabId !== null) {
        chrome.tabs.sendMessage(activeTabId, { type: "TRACKS", payload: msg.payload }).catch((err) => {
        });
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "OFFSCREEN_INIT") {
      chrome.runtime.sendMessage({ type: "INIT", payload: msg.payload }).catch(() => {});
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "CONTENT_SET_NAME") {
      try {
        await chrome.runtime.sendMessage({
          type: "OFFSCREEN_SET_NAME",
          speaker: msg.speaker,
          name: msg.name,
        });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
      return;
    }
  })();

  return true;
});
