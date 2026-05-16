/**
 * Meetlytics Offscreen Document
 *
 * Runs in a hidden page (not a service worker) so it can use:
 * - getUserMedia with a tabCapture stream ID
 * - MediaRecorder API
 * - Blob / URL.createObjectURL
 *
 * Receives messages from background.js, reports back when done.
 */

let mediaRecorder = null;
let audioChunks = [];
let captureStream = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "OFFSCREEN_START_RECORDING") {
    startRecording(message.streamId);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "OFFSCREEN_STOP_RECORDING") {
    stopRecording();
    sendResponse({ success: true });
    return true;
  }
});

async function startRecording(streamId) {
  try {
    // Use the stream ID from tabCapture to get the actual MediaStream
    captureStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    audioChunks = [];

    // Pick best supported format
    const mimeType = getSupportedMimeType();
    mediaRecorder = new MediaRecorder(captureStream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      saveRecording();
    };

    // Collect data every second so we don't lose anything if something crashes
    mediaRecorder.start(1000);
    console.log("[Meetlytics Offscreen] Recording started, mimeType:", mimeType);

  } catch (error) {
    console.error("[Meetlytics Offscreen] Failed to start:", error);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (captureStream) {
    captureStream.getTracks().forEach((t) => t.stop());
    captureStream = null;
  }
}

function saveRecording() {
  if (audioChunks.length === 0) {
    console.warn("[Meetlytics Offscreen] No audio chunks to save");
    return;
  }

  const mimeType = mediaRecorder?.mimeType || "audio/webm";
  const blob = new Blob(audioChunks, { type: mimeType });
  const ext = mimeType.includes("ogg") ? "ogg" : "webm";
  const filename = `meetlytics-${formatDate()}.${ext}`;

  // Convert blob to base64 and send to background for download
  const reader = new FileReader();
  reader.onloadend = () => {
    chrome.runtime.sendMessage({
      type: "SAVE_RECORDING",
      dataUrl: reader.result,
      filename,
      size: blob.size,
    });
  };
  reader.readAsDataURL(blob);

  audioChunks = [];
  console.log("[Meetlytics Offscreen] Recording ready:", filename, `(${(blob.size / 1024 / 1024).toFixed(1)} MB)`);
}

function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function formatDate() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
