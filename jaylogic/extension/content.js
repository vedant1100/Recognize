/**
 * Jaylogic Content Script
 * Auto-starts screen capture on page load, streams video frames to the local server,
 * and displays an always-visible UI panel with face counts and transcripts.
 */

if (!window.__jaylogicContentLoaded) {
  window.__jaylogicContentLoaded = true;

  // ── State ─────────────────────────────────────────────────────────────────
  let isRecording = false;
  let captureStream = null;
  let ws = null;
  let wsConnected = false;
  let frameLoopId = null;
  let hiddenVideo = null;
  let frameCanvas = null;
  let frameCtx = null;
  
  let faceCount = 0;
  let lastSpeaker = null;

  // ── DOM Setup ─────────────────────────────────────────────────────────────
  let overlayRoot = document.createElement("div");
  overlayRoot.id = "jaylogic-overlay";
  document.documentElement.appendChild(overlayRoot);

  const panel = document.createElement("div");
  panel.id = "jaylogic-panel";
  panel.innerHTML = `
    <div class="jl-header">
      <span class="jl-title">Jaylogic</span>
      <span class="jl-status disconnected" id="jl-status">Offline</span>
    </div>
    <div class="jl-body">
      <div class="jl-stat">
        <span class="jl-stat-label">People detected</span>
        <span class="jl-stat-value" id="jl-face-count">0</span>
      </div>
    </div>
    <div class="jl-transcript" id="jl-transcript"></div>
  `;
  overlayRoot.appendChild(panel);

  function setStatus(connected) {
    const statusEl = document.getElementById("jl-status");
    if (!statusEl) return;
    if (connected) {
      statusEl.textContent = "Live";
      statusEl.className = "jl-status connected";
    } else {
      statusEl.textContent = "Offline";
      statusEl.className = "jl-status disconnected";
    }
  }

  function appendTranscript(speaker, word) {
    const container = document.getElementById("jl-transcript");
    if (!container) return;

    if (lastSpeaker === speaker) {
      const last = container.lastElementChild;
      if (last) {
        const textSpan = last.querySelector(".text");
        textSpan.textContent += " " + word;
        container.scrollTop = container.scrollHeight;
        return;
      }
    }

    const div = document.createElement("div");
    div.className = "jl-word";
    div.innerHTML = `<span class="speaker">${speaker}:</span> <span class="text">${word}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    lastSpeaker = speaker;
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  function connectWS() {
    try {
      ws = new WebSocket("ws://localhost:8765/ws");
    } catch (e) {
      console.warn("[jaylogic] WS connect failed:", e);
      return;
    }

    ws.onopen = () => {
      wsConnected = true;
      setStatus(true);
      console.log("[jaylogic] Connected to server");
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        // Update face count from tracks
        if (msg.event === "tracks") {
          const count = msg.tracks ? msg.tracks.length : 0;
          if (count !== faceCount) {
            faceCount = count;
            document.getElementById("jl-face-count").textContent = count;
          }
        }

        // Init event — speakers locked
        if (msg.event === "init") {
          faceCount = msg.speakers ? msg.speakers.length : 0;
          document.getElementById("jl-face-count").textContent = faceCount;
        }

        // Transcribed word
        if (msg.speaker && msg.word) {
          appendTranscript(msg.speaker, msg.word);
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      wsConnected = false;
      setStatus(false);
    };

    ws.onerror = () => { wsConnected = false; };
  }

  function stopWS() {
    if (frameLoopId) {
      clearInterval(frameLoopId);
      frameLoopId = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    wsConnected = false;
    setStatus(false);
  }

  // ── Frame Capture ─────────────────────────────────────────────────────────
  function startFrameCapture() {
    hiddenVideo = document.createElement("video");
    hiddenVideo.srcObject = captureStream;
    hiddenVideo.muted = true;
    hiddenVideo.autoplay = true;
    hiddenVideo.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:1px;height:1px;top:0;left:0";
    document.body.appendChild(hiddenVideo);

    frameCanvas = document.createElement("canvas");
    frameCanvas.width = 640;
    frameCanvas.height = 360;
    frameCtx = frameCanvas.getContext("2d");

    hiddenVideo.addEventListener("loadedmetadata", () => {
      hiddenVideo.play().catch(() => {});
      // Send 10 frames per second to match lip pipeline requirement
      frameLoopId = setInterval(sendFrame, 100);
    });
  }

  function sendFrame() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!hiddenVideo || hiddenVideo.readyState < 2) return;
    try {
      frameCtx.drawImage(hiddenVideo, 0, 0, 640, 360);
      const dataUrl = frameCanvas.toDataURL("image/jpeg", 0.6);
      const base64 = dataUrl.split(",")[1];
      ws.send(JSON.stringify({ ts_ms: Date.now(), frame: base64 }));
    } catch (_) {}
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  async function autostartCapture() {
    try {
      console.log("[jaylogic] Requesting tab capture...");
      captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 15 },
        },
        audio: false, // Server captures mic directly
        preferCurrentTab: true,
      });

      if (!captureStream) throw new Error("Screen share cancelled");

      captureStream.getVideoTracks()[0].addEventListener("ended", () => {
        stopWS();
        isRecording = false;
      });

      connectWS();
      startFrameCapture();
      isRecording = true;
      console.log("[jaylogic] Stream started automatically.");
    } catch (error) {
      console.error("[jaylogic] Autostart failed:", error);
    }
  }

  // Autostart when loaded
  setTimeout(autostartCapture, 1000);
}
