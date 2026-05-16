const wsUrlInput = document.getElementById("wsUrl");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const speakersEl = document.getElementById("speakers");
const transcriptEl = document.getElementById("transcript");

const MAX_LINES = 250;

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b00020" : "#162033";
}

function fmtTime(ms) {
  if (typeof ms !== "number" || Number.isNaN(ms)) return "--:--";
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function appendLine(payload) {
  const line = document.createElement("div");
  line.className = "line";

  const speaker = payload.speaker || "unknown";
  const word = payload.word || "";
  const time = fmtTime(payload.start_ms);

  line.innerHTML = `<span class="speaker">${speaker}</span>: ${word}<span class="time">${time}</span>`;
  transcriptEl.appendChild(line);

  while (transcriptEl.childElementCount > MAX_LINES) {
    transcriptEl.removeChild(transcriptEl.firstChild);
  }
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

async function refreshState() {
  const state = await chrome.runtime.sendMessage({ type: "UI_GET_STATE" });
  if (state?.defaultWsUrl && !wsUrlInput.value) {
    wsUrlInput.value = state.defaultWsUrl;
  }

  if (state?.running) {
    setStatus(state.connected ? "Streaming + connected" : "Streaming (connecting)");
  } else {
    setStatus("Idle");
  }
}

startBtn.addEventListener("click", async () => {
  const wsUrl = wsUrlInput.value.trim() || "ws://localhost:8765/ws";
  const result = await chrome.runtime.sendMessage({ type: "UI_START", wsUrl });
  if (!result?.ok) {
    setStatus(result?.error || "Failed to start", true);
    return;
  }
  setStatus("Starting stream...");
});

stopBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "UI_STOP" });
  setStatus("Stopped");
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE") {
    if (msg.error) {
      setStatus(msg.error, true);
      return;
    }

    if (msg.running) {
      setStatus(msg.connected ? "Streaming + connected" : "Streaming (connecting)");
      return;
    }

    setStatus("Idle");
    return;
  }

  if (msg.type === "INIT" && msg.payload?.speakers) {
    speakersEl.textContent = `Speakers: ${msg.payload.speakers.join(", ")}`;
    return;
  }

  if (msg.type === "WORD" && msg.payload) {
    appendLine(msg.payload);
  }
});

refreshState().catch((err) => {
  setStatus(String(err?.message || err), true);
});
