const FPS = 12;
const JPEG_QUALITY = 0.6;

const videoEl = document.getElementById("v");
const canvasEl = document.getElementById("c");
const ctx = canvasEl.getContext("2d", { alpha: false });

let mediaStream = null;
let ws = null;
let timer = null;
let sessionStartMs = 0;
let running = false;


function safeSendStatus(extra = {}) {
  chrome.runtime.sendMessage({
    type: "OFFSCREEN_STATUS",
    running,
    connected: !!(ws && ws.readyState === WebSocket.OPEN),
    ...extra
  }).catch(() => {});
}

function cleanupMedia() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  if (mediaStream) {
    for (const t of mediaStream.getTracks()) {
      t.stop();
    }
    mediaStream = null;
  }

  videoEl.srcObject = null;
}

function cleanupSocket() {
  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
    ws = null;
  }
}

async function start({ streamId, wsUrl }) {
  await stop();

  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    }
  };

  mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = mediaStream;
  await videoEl.play();

  ws = new WebSocket(wsUrl);
  sessionStartMs = performance.now();

  ws.onopen = () => {
    running = true;
    safeSendStatus();

    const intervalMs = Math.max(20, Math.round(1000 / FPS));
    timer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      if (!videoEl.videoWidth || !videoEl.videoHeight) {
        return;
      }

      if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
        canvasEl.width = videoEl.videoWidth;
        canvasEl.height = videoEl.videoHeight;
      }

      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const dataUrl = canvasEl.toDataURL("image/jpeg", JPEG_QUALITY);
      const b64 = dataUrl.split(",", 2)[1];
      const payload = {
        ts_ms: performance.now() - sessionStartMs,
        frame: b64
      };
      ws.send(JSON.stringify(payload));
    }, intervalMs);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.event === "init") {
        chrome.runtime.sendMessage({ type: "OFFSCREEN_INIT", payload: msg }).catch(() => {});
        return;
      }
      if (msg.event === "tracks") {
        chrome.runtime.sendMessage({ type: "OFFSCREEN_TRACKS", payload: msg }).catch(() => {});
        return;
      }
      chrome.runtime.sendMessage({ type: "OFFSCREEN_WORD", payload: msg }).catch(() => {});
    } catch {
      // ignore malformed backend messages
    }
  };

  ws.onerror = () => {
    safeSendStatus({ error: "WebSocket error. Verify backend is running at ws://localhost:8765/ws." });
  };

  ws.onclose = () => {
    running = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    safeSendStatus();
  };

  safeSendStatus();
}

async function stop() {
  running = false;
  cleanupMedia();
  cleanupSocket();
  safeSendStatus();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "OFFSCREEN_START") {
      try {
        await start(msg);
        sendResponse({ ok: true });
      } catch (err) {
        running = false;
        safeSendStatus({ error: String(err?.message || err) });
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
      return;
    }

    if (msg.type === "OFFSCREEN_STOP") {
      await stop();
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "OFFSCREEN_SET_NAME") {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: "set_name",
          speaker: msg.speaker,
          name: msg.name || "",
        }));
      }
      sendResponse({ ok: true });
      return;
    }
  })();

  return true;
});
