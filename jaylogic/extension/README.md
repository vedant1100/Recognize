# Jaylogic Chrome Extension

Chrome extension that streams Google Meet tab video frames to the local jaylogic backend and displays live speaker-labeled words.

## Backend contract

This extension targets `jaylogic/server.py` on:

- `ws://localhost:8765/ws`

Outgoing frame payload:

```json
{"ts_ms": 1234.5, "frame": "<base64 jpeg>"}
```

Incoming backend messages:

```json
{"event": "init", "speakers": ["person_1", "person_2"]}
{"speaker": "person_1", "word": "hello", "start_ms": 1200, "end_ms": 1400}
```

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the folder:
   - `/Users/senpai/Desktop/Projects/RecognizeAI/recognize/jaylogic/extension`

## Run

1. Start backend:
   - `cd /Users/senpai/Desktop/Projects/RecognizeAI/recognize/jaylogic`
   - `python server.py`
2. Open your Google Meet tab.
3. Click the extension icon.
4. Keep `ws://localhost:8765/ws` or set your custom URL.
5. Click **Start**.
6. Watch transcript lines stream in popup.

## Notes

- Capture runs from an offscreen document using `tabCapture`.
- Frames are sent at 12 FPS as JPEG.
- If backend is unreachable, popup status shows an error.
