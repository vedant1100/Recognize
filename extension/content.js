/**
 * Meetlytics Content Script
 * Uses getDisplayMedia to capture full meeting video + audio.
 * Records to MP4/WebM, downloads on stop.
 */

(function () {
  if (document.getElementById("meetlytics-root")) return;

  // ── State ────────────────────────────────────────────────────────────────
  let isRecording = false;
  let isPanelOpen = false;
  let recordingStartTime = null;
  let timerInterval = null;
  let participants = [];
  let mediaRecorder = null;
  let audioChunks = [];
  let captureStream = null;  // keep reference for full cleanup
  let micStream = null;      // separate mic stream for cleanup
  let audioCtx = null;       // AudioContext for mixing

  // ── Create DOM ───────────────────────────────────────────────────────────
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
      <button class="ml-close" id="meetlytics-close">✕</button>
    </div>

    <div class="ml-status">
      <div class="ml-status-dot idle" id="meetlytics-dot"></div>
      <span id="meetlytics-status-text">Ready to record</span>
    </div>

    <div class="ml-timer" id="meetlytics-timer" style="display:none">
      <span id="meetlytics-timer-value">00:00:00</span>
      <span class="ml-timer-label">Recording</span>
    </div>

    <div class="ml-actions">
      <button class="ml-btn primary" id="meetlytics-record-btn">
        <span class="ml-btn-icon">●</span>
        Start Recording
      </button>
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
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  });

  // ── Recording via getDisplayMedia (full video + audio) ────────────────────
  async function startRecording() {
    try {
      // Full cleanup of any previous session first
      cleanupStream();

      setStatus("Starting capture...", "idle");
      recordBtn.disabled = true;

      // Step 1: grab the tab screen + audio
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

      // Step 2: grab the mic (user's own voice in the meeting)
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      } catch (e) {
        console.warn("[Meetlytics] Mic access denied — recording without mic:", e);
      }

      // Step 3: mix tab audio + mic into one audio track via AudioContext
      audioCtx = new AudioContext();
      const destination = audioCtx.createMediaStreamDestination();

      // Add tab audio (remote participants)
      if (captureStream.getAudioTracks().length > 0) {
        const tabSource = audioCtx.createMediaStreamSource(
          new MediaStream(captureStream.getAudioTracks())
        );
        tabSource.connect(destination);
      }

      // Add mic audio (local user)
      if (micStream && micStream.getAudioTracks().length > 0) {
        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(destination);
      }

      // Step 4: build final stream — video from tab + mixed audio
      const finalStream = new MediaStream([
        ...captureStream.getVideoTracks(),
        ...destination.stream.getTracks(),
      ]);

      const hasAudio = finalStream.getAudioTracks().length > 0;
      if (!hasAudio) {
        showNotification("Warning: no audio captured — mic or tab audio required", "error");
      }

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

      isRecording = true;
      recordingStartTime = Date.now();
      recordBtn.disabled = false;
      recordBtn.innerHTML = `<span class="ml-btn-icon stop">■</span> Stop Recording`;
      recordBtn.classList.add("recording");
      document.getElementById("meetlytics-timer").style.display = "flex";
      setStatus("Recording in progress", "recording");
      timerInterval = setInterval(updateTimer, 1000);

      // Hide extension UI so it doesn't appear in the recording
      root.style.display = "none";

      const audioNote = hasAudio ? "" : " (no audio)";
      console.log("[Meetlytics] Recording started:", mimeType, audioNote);

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
      mediaRecorder.stop(); // triggers onstop → saveRecording()
    } else {
      cleanupStream();
    }

    isRecording = false;
    clearInterval(timerInterval);

    // Bring the UI back
    root.style.display = "";

    recordBtn.innerHTML = `<span class="ml-btn-icon">●</span> Start Recording`;
    recordBtn.classList.remove("recording");
    document.getElementById("meetlytics-dot").className = "ml-status-dot idle";
    document.getElementById("meetlytics-timer").style.display = "none";
    setStatus("Saving...", "idle");
  }

  function cleanupStream() {
    if (captureStream) {
      captureStream.getTracks().forEach((t) => t.stop());
      captureStream = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
    mediaRecorder = null;
  }

  function saveRecording() {
    if (audioChunks.length === 0) {
      setStatus("Ready to record", "idle");
      showNotification("No data captured — try again", "error");
      return;
    }

    // Use webm — universally supported in Chrome
    const mimeType = "video/webm";
    const blob = new Blob(audioChunks, { type: mimeType });
    const filename = `meetlytics-${formatDate()}.webm`;
    const sizeMb = (blob.size / 1024 / 1024).toFixed(1);

    // Trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revoke after a short delay so download has time to start
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    audioChunks = [];
    setStatus("Ready to record", "idle");
    showNotification(`Saved: ${filename} (${sizeMb} MB)`, "success");
    showSessionInfo(filename, sizeMb);

    console.log("[Meetlytics] Saved:", filename, sizeMb + "MB");
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getBestMimeType() {
    const types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "video/webm";
  }

  function updateTimer() {
    if (!recordingStartTime) return;
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const h = Math.floor(elapsed / 3600).toString().padStart(2, "0");
    const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, "0");
    const s = (elapsed % 60).toString().padStart(2, "0");
    document.getElementById("meetlytics-timer-value").textContent =
      `${h}:${m}:${s}`;
  }

  function setStatus(text, type) {
    document.getElementById("meetlytics-status-text").textContent = text;
    document.getElementById("meetlytics-dot").className = `ml-status-dot ${type}`;
  }

  function showSessionInfo(filename, sizeMb) {
    const section = document.getElementById("meetlytics-session-section");
    const info = document.getElementById("meetlytics-session-info");
    const duration = recordingStartTime
      ? Math.floor((Date.now() - recordingStartTime) / 1000)
      : 0;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;

    info.innerHTML = `
      <div class="ml-session-row">
        <span>Duration</span><strong>${mins}m ${secs}s</strong>
      </div>
      <div class="ml-session-row">
        <span>Participants</span><strong>${participants.length}</strong>
      </div>
      <div class="ml-session-row">
        <span>Size</span><strong>${sizeMb} MB</strong>
      </div>
      <div class="ml-session-row">
        <span>File</span><strong>${filename}</strong>
      </div>
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
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  // ── Participant detection ─────────────────────────────────────────────────
  function detectParticipants() {
    const tiles = document.querySelectorAll("[data-participant-id]");
    const names = new Set();

    tiles.forEach((tile) => {
      const label =
        tile.getAttribute("aria-label") ||
        tile.querySelector("[class*='name']")?.textContent ||
        tile.querySelector("[class*='ZjFb7c']")?.textContent;
      if (label && label.trim().length > 1 && label.trim().length < 60) {
        names.add(label.trim());
      }
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

    container.innerHTML = participants.map((name) => `
      <div class="ml-participant">
        <div class="ml-avatar">${getInitials(name)}</div>
        <span class="ml-participant-name">${name}</span>
        ${isRecording ? `<span class="ml-recording-dot"></span>` : ""}
      </div>
    `).join("");
  }

  // Listen for messages from background
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
