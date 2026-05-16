if (window.__jaylogicContentLoaded) {
  // Already initialized for this tab/frame.
} else {
  window.__jaylogicContentLoaded = true;

  let overlayRoot = null;
  const speakerNodes = new Map();
  let lastRenderTs = 0;

  function ensureOverlay() {
    if (overlayRoot) return overlayRoot;
    overlayRoot = document.createElement("div");
    overlayRoot.id = "jaylogic-overlay";
    document.documentElement.appendChild(overlayRoot);
    return overlayRoot;
  }

  function ensureSpeakerNode(speaker, name) {
    const root = ensureOverlay();
    let node = speakerNodes.get(speaker);
    if (node) return node;

    const box = document.createElement("div");
    box.className = "jaylogic-box";

    const wrap = document.createElement("div");
    wrap.className = "jaylogic-name-wrap";

    const input = document.createElement("input");
    input.className = "jaylogic-name-input";
    input.type = "text";
    input.placeholder = speaker;
    input.value = name || "";
    input.addEventListener("change", () => {
      chrome.runtime.sendMessage({
        type: "CONTENT_SET_NAME",
        speaker,
        name: input.value.trim(),
      }).catch(() => {});
    });

    wrap.appendChild(input);
    root.appendChild(box);
    root.appendChild(wrap);

    node = { box, wrap, input, lastSeenMs: Date.now() };
    speakerNodes.set(speaker, node);
    return node;
  }

  function renderTracks(payload) {
    if (!payload || !Array.isArray(payload.tracks)) return;

    const nowTs = performance.now();
    if (nowTs - lastRenderTs < 120) return; // throttle DOM updates
    lastRenderTs = nowTs;

    const showBoxes = payload.bounding_boxes !== false;
    const frameW = Number(payload.frame_w) || window.innerWidth;
    const frameH = Number(payload.frame_h) || window.innerHeight;
    const scaleX = window.innerWidth / frameW;
    const scaleY = window.innerHeight / frameH;
    const seen = new Set();

    for (const t of payload.tracks) {
      const speaker = t.speaker;
      if (!speaker || speaker === "unknown") continue;

      const bbox = t.bbox || [0, 0, 0, 0];
      const x = Number(bbox[0]) || 0;
      const y = Number(bbox[1]) || 0;
      const w = Number(bbox[2]) || 0;
      const h = Number(bbox[3]) || 0;

      const node = ensureSpeakerNode(speaker, t.name || "");
      const px = Math.max(0, Math.round((x + w / 2) * scaleX - 65));
      const py = Math.max(0, Math.round(y * scaleY - 30));
      const bx = Math.max(0, Math.round(x * scaleX));
      const by = Math.max(0, Math.round(y * scaleY));
      const bw = Math.max(2, Math.round(w * scaleX));
      const bh = Math.max(2, Math.round(h * scaleY));

      node.wrap.style.transform = `translate(${px}px, ${py}px)`;
      node.box.style.transform = `translate(${bx}px, ${by}px)`;
      node.box.style.width = `${bw}px`;
      node.box.style.height = `${bh}px`;
      node.lastSeenMs = Date.now();
      node.wrap.style.display = "block";
      node.box.style.display = showBoxes ? "block" : "none";

      if ((!document.activeElement || document.activeElement !== node.input) && t.name && node.input.value !== t.name) {
        node.input.value = t.name;
      }

      seen.add(speaker);
    }

    const now = Date.now();
    for (const [speaker, node] of speakerNodes.entries()) {
      if (!seen.has(speaker) && now - node.lastSeenMs > 2500) {
        node.wrap.style.display = "none";
        node.box.style.display = "none";
      }
    }
  }

  function setRunning(running) {
    if (!overlayRoot) return;
    overlayRoot.style.display = running ? "block" : "none";
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "TRACKS" && msg.payload) {
      renderTracks(msg.payload);
    }
    if (msg.type === "STATE") {
      setRunning(!!msg.running);
    }
    if (msg.type === "PING_CONTENT") {
      sendResponse({ ok: true, loaded: true });
    }
    return true;
  });
}
