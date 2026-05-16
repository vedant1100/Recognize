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
          if (msg.tracks && msg.bounding_boxes) {
             renderTracks(msg.tracks);
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

  // ── Bounding Boxes & Names ────────────────────────────────────────────────
  function renderTracks(tracks) {
    let container = document.getElementById("jl-track-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "jl-track-container";
      container.style.cssText = "position:absolute; inset:0; pointer-events:none;";
      overlayRoot.appendChild(container);
    }
    
    // We want to reuse input elements so they don't lose focus
    const currentTids = new Set(tracks.map(t => t.track_id));
    
    // Remove stale
    Array.from(container.children).forEach(child => {
      if (!currentTids.has(child.dataset.tid)) {
        child.remove();
      }
    });

    tracks.forEach(t => {
      let box = document.getElementById("box-" + t.track_id);
      let wrap = document.getElementById("wrap-" + t.track_id);
      
      if (!box) {
        box = document.createElement("div");
        box.id = "box-" + t.track_id;
        box.className = "jaylogic-box";
        box.dataset.tid = t.track_id;
        
        wrap = document.createElement("div");
        wrap.id = "wrap-" + t.track_id;
        wrap.className = "jaylogic-name-wrap";
        wrap.dataset.tid = t.track_id;
        
        const input = document.createElement("input");
        input.className = "jaylogic-name-input";
        input.type = "text";
        input.placeholder = "Enter Name...";
        
        input.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            input.blur();
            console.log("[jaylogic] Sending set_name:", t.speaker, "->", input.value);
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                event: "set_name",
                speaker: t.speaker,
                name: input.value
              }));
            }
          }
        });

        ["pointerdown", "click", "keyup", "keypress"].forEach(evt => {
          input.addEventListener(evt, e => e.stopPropagation());
        });
        
        wrap.appendChild(input);
        container.appendChild(box);
        container.appendChild(wrap);
      }
      
      const input = wrap.querySelector("input");
      const isFocused = document.activeElement === input;
      
      if (!isFocused) {
        input.value = t.name || t.speaker;
        input.placeholder = t.speaker;
      }
      
      if (t.is_speaking) {
        box.style.borderColor = "#ff4444";
        box.style.boxShadow = "0 0 10px rgba(255, 68, 68, 0.5)";
      } else {
        box.style.borderColor = "#11c26d";
        box.style.boxShadow = "0 0 0 1px rgba(0, 0, 0, 0.35)";
      }
      
      const [x, y, w, h] = t.bbox;
      const scaleX = window.innerWidth / 640;
      const scaleY = window.innerHeight / 360;
      
      const finalX = x * scaleX;
      const finalY = y * scaleY;
      
      box.style.left = finalX + "px";
      box.style.top = finalY + "px";
      box.style.width = (w * scaleX) + "px";
      box.style.height = (h * scaleY) + "px";
      
      // Freeze the input box position if the user is typing in it!
      if (!isFocused) {
        wrap.style.left = finalX + "px";
        wrap.style.top = (finalY - 30) + "px";
      }
    });
  }

  // Autostart when loaded
  setTimeout(autostartCapture, 1000);
}
