/**
 * Meetlytics Content Script
 * Records full meeting + streams to jaylogic for live speaker diarization.
 */

(function () {
  if (document.getElementById("meetlytics-root")) return;

  // ── State ─────────────────────────────────────────────────────────────────
  let isRecording = false;
  let isPanelOpen = false;
  let recordingStartTime = null;
  let timerInterval = null;
  let participants = [];
  let mediaRecorder = null;
  let audioChunks = [];
  let captureStream = null;
  let micStream = null;
  let audioCtx = null;

  // Jaylogic WS
  let ws = null;
  let wsConnected = false;
  let frameLoopId = null;
  let hiddenVideo = null;
  let frameCanvas = null;
  let frameCtx = null;
  let pcmAudioCtx = null;
  let wsWords = []; // [{speaker, word, ts}]

  // ── Create DOM ────────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.id = "meetlytics-root";
  document.body.appendChild(root);

  const fab = document.createElement("button");
  fab.id = "meetlytics-fab";
  fab.innerHTML = `<span>M</span>`;
  fab.title = "Meetlytics";
  root.appendChild(fab);

  const panel = document.createElement("div");
  panel.id = "meetlytics-panel";
  panel.innerHTML = `
    <div class="ml-header">
      <div class="ml-logo">
        <span class="ml-logo-icon">M</span>
        <span class="ml-logo-text">Meetlytics</span>
      </div>
      <button class="ml-close" id="meetlytics-close">&#x2715;</button>
    </div>

    <div class="ml-status">
      <div class="ml-status-dot idle" id="meetlytics-dot"></div>
      <span id="meetlytics-status-text">Ready to record</span>
      <span class="ml-ai-badge" id="meetlytics-ai-badge" style="display:none">AI LIVE</span>
    </div>

    <div class="ml-timer" id="meetlytics-timer" style="display:none">
      <span id="meetlytics-timer-value">00:00:00</span>
      <span class="ml-timer-label">Recording</span>
    </div>

    <div class="ml-actions">
      <button class="ml-btn primary" id="meetlytics-record-btn">
        <span class="ml-btn-icon">&#x25CF;</span>
        Start Recording
      </button>
      <a class="ml-btn ghost" id="meetlytics-dashboard-link"
         href="http://localhost:5173" target="_blank"
         style="display:none;text-decoration:none;margin-top:6px">
        &#x2197; Open Dashboard
      </a>
    </div>

    <div class="ml-section">
      <div class="ml-section-title">
        Participants
        <span class="ml-badge" id="meetlytics-count">0</span>
      </div>
      <div class="ml-participants" id="meetlytics-participants">
        <div class="ml-empty">Waiting for participants...</div>
      </div>
    </div>

    <div class="ml-section" id="meetlytics-session-section" style="display:none">
      <div class="ml-section-title">Last Session</div>
      <div class="ml-session-info" id="meetlytics-session-info"></div>
    </div>

    <div class="ml-footer">Meetlytics v1.0</div>
  `;
  root.appendChild(panel);

  // ── Toggle panel ──────────────────────────────────────────────────────────
  fab.addEventListener("click", () => {
    isPanelOpen = !isPanelOpen;
    panel.classList.toggle("open", isPanelOpen);
    fab.classList.toggle("active", isPanelOpen);
  });

  document.getElementById("meetlytics-close").addEventListener("click", () => {
    isPanelOpen = false;
    panel.classList.remove("open");
    fab.classList.remove("active");
  });

  // ── Record button ─────────────────────────────────────────────────────────
  const recordBtn = document.getElementById("meetlytics-record-btn");
  recordBtn.addEventListener("click", () => {
    if (!isRecording) startRecording();
    else stopRecording();
  });

  // ── WebSocket to jaylogic ─────────────────────────────────────────────────
  function connectWS() {
    try {
      ws = new WebSocket("ws://localhost:8765/ws");
    } catch (e) {
      console.warn("[Meetlytics] WS connect failed:", e);
      return;
    }

    ws.onopen = () => {
      wsConnected = true;
      document.getElementById("meetlytics-ai-badge").style.display = "inline-block";
      console.log("[Meetlytics] Connected to jaylogic");
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "init") {
          console.log("[Meetlytics] Speakers locked:", msg.speakers);
        } else if (msg.speaker && msg.word) {
          wsWords.push({ speaker: msg.speaker, word: msg.word, ts: Date.now() });
        }
      } catch (_) {}
    };

    ws.onclose = () => {
      wsConnected = false;
      document.getElementById("meetlytics-ai-badge").style.display = "none";
    };

    ws.onerror = () => { wsConnected = false; };
  }

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
      frameLoopId = setInterval(sendFrame, 100); // 10fps to jaylogic
    });
  }

  function sendFrame() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!hiddenVideo || hiddenVideo.readyState < 2) return;
    try {
      frameCtx.drawImage(hiddenVideo, 0, 0, 640, 360);
      const dataUrl = frameCanvas.toDataURL("image/jpeg", 0.6);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      ws.send(JSON.stringify({ ts_ms: Date.now(), frame: base64 }));
    } catch (_) {}
  }

  function startAudioPCM() {
    const tracks = micStream
      ? [...micStream.getAudioTracks()]
      : [...(captureStream.getAudioTracks() || [])];

    if (!tracks.length) return;

    try {
      pcmAudioCtx = new AudioContext({ sampleRate: 16000 });
      const source = pcmAudioCtx.createMediaStreamSource(new MediaStream(tracks));
      // 1600 samples = 100ms at 16kHz
      const processor = pcmAudioCtx.createScriptProcessor(1600, 1, 1);

      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32767));
        }
        const bytes = new Uint8Array(int16.buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
        }
        ws.send(JSON.stringify({ type: "audio", ts_ms: Date.now(), pcm: btoa(binary) }));
      };

      source.connect(processor);
      processor.connect(pcmAudioCtx.destination);
    } catch (e) {
      console.warn("[Meetlytics] PCM setup failed:", e);
    }
  }

  function stopWS() {
    clearInterval(frameLoopId);
    frameLoopId = null;

    if (hiddenVideo) { hiddenVideo.remove(); hiddenVideo = null; }
    frameCanvas = null;
    frameCtx = null;

    if (pcmAudioCtx) { pcmAudioCtx.close().catch(() => {}); pcmAudioCtx = null; }

    if (ws) { ws.close(); ws = null; }
    wsConnected = false;
    document.getElementById("meetlytics-ai-badge").style.display = "none";
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      cleanupStream();
      wsWords = [];

      setStatus("Starting capture...", "idle");
      recordBtn.disabled = true;

      captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 15 },
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          suppressLocalAudioPlayback: false,
        },
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      });

      if (!captureStream) throw new Error("Screen share cancelled");

      captureStream.getVideoTracks()[0].addEventListener("ended", () => {
        if (isRecording) stopRecording();
      });

      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      } catch (e) {
        console.warn("[Meetlytics] Mic denied:", e);
      }

      // Mix tab + mic audio for the .webm recording file
      audioCtx = new AudioContext();
      const destination = audioCtx.createMediaStreamDestination();

      if (captureStream.getAudioTracks().length > 0) {
        audioCtx.createMediaStreamSource(
          new MediaStream(captureStream.getAudioTracks())
        ).connect(destination);
      }
      if (micStream && micStream.getAudioTracks().length > 0) {
        audioCtx.createMediaStreamSource(micStream).connect(destination);
      }

      const finalStream = new MediaStream([
        ...captureStream.getVideoTracks(),
        ...destination.stream.getTracks(),
      ]);

      audioChunks = [];
      const mimeType = getBestMimeType();
      mediaRecorder = new MediaRecorder(finalStream, {
        mimeType,
        videoBitsPerSecond: 1500000,
        audioBitsPerSecond: 128000,
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        cleanupStream();
        saveRecording();
      };
      mediaRecorder.start(1000);

      // Connect to jaylogic — stream frames + audio PCM live
      connectWS();
      startFrameCapture();
      startAudioPCM();

      isRecording = true;
      recordingStartTime = Date.now();
      recordBtn.disabled = false;
      recordBtn.innerHTML = `<span class="ml-btn-icon stop">&#x25A0;</span> Stop Recording`;
      recordBtn.classList.add("recording");
      document.getElementById("meetlytics-timer").style.display = "flex";
      document.getElementById("meetlytics-dashboard-link").style.display = "flex";
      setStatus("Recording in progress", "recording");
      timerInterval = setInterval(updateTimer, 1000);

      // Hide UI so it doesn't appear in the recording
      root.style.display = "none";

      console.log("[Meetlytics] Recording started:", mimeType);
    } catch (error) {
      console.error("[Meetlytics] Failed:", error);
      cleanupStream();
      recordBtn.disabled = false;
      setStatus("Ready to record", "idle");
      if (error.name === "NotAllowedError" || error.message.includes("cancelled")) {
        showNotification("Recording cancelled", "info");
      } else {
        showNotification(`Error: ${error.message}`, "error");
      }
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      cleanupStream();
    }

    stopWS();
    isRecording = false;
    clearInterval(timerInterval);

    root.style.display = "";
    recordBtn.innerHTML = `<span class="ml-btn-icon">&#x25CF;</span> Start Recording`;
    recordBtn.classList.remove("recording");
    document.getElementById("meetlytics-dot").className = "ml-status-dot idle";
    document.getElementById("meetlytics-timer").style.display = "none";
    setStatus("Saving...", "idle");
  }

  function cleanupStream() {
    if (captureStream) { captureStream.getTracks().forEach(t => t.stop()); captureStream = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
    mediaRecorder = null;
  }

  function saveRecording() {
    if (audioChunks.length === 0) {
      setStatus("Ready to record", "idle");
      showNotification("No data captured — try again", "error");
      return;
    }

    const blob = new Blob(audioChunks, { type: "video/webm" });
    const filename = `meetlytics-${formatDate()}.webm`;
    const sizeMb = (blob.size / 1024 / 1024).toFixed(1);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    // Save transcript JSON alongside the video
    if (wsWords.length > 0) saveTranscript(filename);

    audioChunks = [];
    setStatus("Ready to record", "idle");
    showNotification(`Saved: ${filename} (${sizeMb} MB)`, "success");
    showSessionInfo(filename, sizeMb);
    console.log("[Meetlytics] Saved:", filename, sizeMb + "MB", wsWords.length + " words");
  }

  function saveTranscript(videoFilename) {
    const utterances = [];
    let cur = null;
    for (const w of wsWords) {
      if (!cur || cur.speaker !== w.speaker) {
        cur = { speaker: w.speaker, text: w.word, start_ms: w.ts };
        utterances.push(cur);
      } else {
        cur.text += " " + w.word;
      }
    }
    const data = { recorded_at: new Date().toISOString(), participants, word_count: wsWords.length, utterances };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const filename = videoFilename.replace(".webm", "-transcript.json");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getBestMimeType() {
    const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (const t of types) if (MediaRecorder.isTypeSupported(t)) return t;
    return "video/webm";
  }

  function updateTimer() {
    if (!recordingStartTime) return;
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const h = Math.floor(elapsed / 3600).toString().padStart(2, "0");
    const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, "0");
    const s = (elapsed % 60).toString().padStart(2, "0");
    document.getElementById("meetlytics-timer-value").textContent = `${h}:${m}:${s}`;
  }

  function setStatus(text, type) {
    document.getElementById("meetlytics-status-text").textContent = text;
    document.getElementById("meetlytics-dot").className = `ml-status-dot ${type}`;
  }

  function showSessionInfo(filename, sizeMb) {
    const section = document.getElementById("meetlytics-session-section");
    const info = document.getElementById("meetlytics-session-info");
    const duration = recordingStartTime ? Math.floor((Date.now() - recordingStartTime) / 1000) : 0;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;

    const wordCounts = {};
    for (const w of wsWords) wordCounts[w.speaker] = (wordCounts[w.speaker] || 0) + 1;
    const speakerRows = Object.entries(wordCounts)
      .map(([s, n]) => `<div class="ml-session-row"><span>${s}</span><strong>${n} words</strong></div>`)
      .join("");

    info.innerHTML = `
      <div class="ml-session-row"><span>Duration</span><strong>${mins}m ${secs}s</strong></div>
      <div class="ml-session-row"><span>Participants</span><strong>${participants.length}</strong></div>
      <div class="ml-session-row"><span>Words transcribed</span><strong>${wsWords.length}</strong></div>
      <div class="ml-session-row"><span>Size</span><strong>${sizeMb} MB</strong></div>
      ${speakerRows}
    `;
    section.style.display = "block";
  }

  function showNotification(message, type = "info") {
    const existing = document.getElementById("meetlytics-notification");
    if (existing) existing.remove();
    const notif = document.createElement("div");
    notif.id = "meetlytics-notification";
    notif.className = `ml-notification ${type}`;
    notif.textContent = message;
    root.appendChild(notif);
    setTimeout(() => notif.remove(), 4000);
  }

  function formatDate() {
    return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  }

  function getInitials(name) {
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }

  // ── Participant detection ─────────────────────────────────────────────────
  function detectParticipants() {
    const names = new Set();
    document.querySelectorAll("[data-participant-id]").forEach((tile) => {
      const label =
        tile.getAttribute("aria-label") ||
        tile.querySelector("[class*='name']")?.textContent ||
        tile.querySelector("[class*='ZjFb7c']")?.textContent;
      if (label && label.trim().length > 1 && label.trim().length < 60) names.add(label.trim());
    });
    document.querySelectorAll("[data-member-id] span").forEach((el) => {
      const text = el.textContent?.trim();
      if (text && text.length > 1 && text.length < 60) names.add(text);
    });
    participants = Array.from(names);
    renderParticipants();
  }

  function renderParticipants() {
    const container = document.getElementById("meetlytics-participants");
    const countBadge = document.getElementById("meetlytics-count");
    countBadge.textContent = participants.length;

    if (participants.length === 0) {
      container.innerHTML = `<div class="ml-empty">No participants detected yet</div>`;
      return;
    }

    container.innerHTML = participants.map(name => `
      <div class="ml-participant">
        <div class="ml-avatar">${getInitials(name)}</div>
        <span class="ml-participant-name">${name}</span>
        ${isRecording ? `<span class="ml-recording-dot"></span>` : ""}
      </div>
    `).join("");
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TOGGLE_PANEL") {
      isPanelOpen = !isPanelOpen;
      panel.classList.toggle("open", isPanelOpen);
      fab.classList.toggle("active", isPanelOpen);
    }
  });

  setInterval(detectParticipants, 5000);
  detectParticipants();
})();
