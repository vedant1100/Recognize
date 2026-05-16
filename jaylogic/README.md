# jaylogic — Real-Time Speaker Diarization for Google Meet

Identifies who is speaking in a Google Meet call, word by word, in real time.
Single video feed, single mic — no cloud APIs.

---

## What It Does

Given one Google Meet room camera tile (all participants visible in one shot) and the local microphone, jaylogic outputs a live transcript like:

```
person_1: "let's move to the next item"
person_3: "I had a question about that"
unknown:  "hmm"
```

Every word is labeled with the person who said it, streamed live to a Chrome extension.

---

## System Architecture

Three pipelines run in parallel and merge at word boundaries:

```
Thread 1 (video):
  Chrome Extension
    └─ chrome.tabCapture → JPEG frames over WebSocket
       └─ SCRFD (InsightFace) → face bounding boxes per frame
          └─ BoT-SORT (boxmot) → stable track IDs per face
             └─ face crop ring buffer (last 25 crops per track)
                └─ every 200ms: TalkNet → speaking score per track → speaker timeline

Thread 2 (audio):
  Microphone (sounddevice, 16kHz mono)
    ├─ → audio_ring_buffer (shared with Thread 1 for TalkNet)
    └─ → Vosk (local ASR) → word + timestamp queue

Sync (in Thread 1, on each word):
  word_queue + speaker_timeline
    └─ argmax(avg_prob over word window) → attributed word → WebSocket → Extension
```

### Shared Clock

`SESSION_START_MS = time.monotonic() * 1000` is set once at `server.py` startup. Every timestamp — video frames, audio chunks, Vosk word boundaries, TalkNet results — is milliseconds since this anchor. This is the only synchronization between threads.

---

## How Speaker Attribution Works

1. **Face tracking** — SCRFD detects faces each frame. BoT-SORT tracks them across frames, giving each face a stable integer `track_id`. At frame 30 (~1 second), tracks are sorted left-to-right by bbox x-coordinate and permanently mapped: `track_id → person_1, person_2, ... person_N`.

2. **Active speaker detection** — Every 200ms, TalkNet runs on each tracked face. It takes:
   - Last 25 grayscale 224×224 face crops (1 second of visual)
   - Last 1 second of audio converted to MFCC features (shape: `100×13`)
   - Outputs a raw score per track: `≥ 0` means speaking, `< 0` means silent

3. **Transcription** — Vosk streams mic audio in 100ms PCM chunks and outputs words with precise start/end timestamps at utterance boundaries.

4. **Sync** — When a word arrives, look up the speaker timeline for all TalkNet results within `[word.start_ms - 200ms, word.end_ms + 200ms]`. Average each person's score over the window. `argmax` wins. Confidence floor: if `max(avg_score) < 0.3` → emit `speaker: unknown`.

5. **Cold start** — First 1 second (`end_ms < 1000`): emit `unknown` for all words. TalkNet isn't reliable until it has a full audio-visual window.

---

## File Structure

```
jaylogic/
├── README.md
├── PIPELINE.md               # detailed step-by-step flow spec
├── requirements.txt
├── server.py                 # FastAPI + WebSocket; wires all stages
│
├── tracker/
│   └── tracker.py            # SCRFD detection + BoT-SORT tracking
│
├── asd/
│   ├── model.py              # loads pretrain_TalkSet.model into talkNetModel
│   ├── talkNetModel.py       # TalkNet model definition (forward methods)
│   ├── audioEncoder.py       # SE-ResNet audio feature extractor
│   ├── visualEncoder.py      # ResNet18 + TCN visual feature extractor
│   ├── attentionLayer.py     # cross-modal attention layer
│   └── inference.py          # AudioRingBuffer + ASDInference (crop buffers + TalkNet)
│
├── asr/
│   └── transcriber.py        # Vosk streaming ASR on mic → word timestamps
│
├── sync/
│   └── diarizer.py           # timeline lookup + argmax + confidence floor
│
├── pretrain_TalkSet.model    # TalkNet pretrained weights (60MB)
└── vosk-model/               # Vosk English ASR model (lgraph, 128MB)
```

---

## Frameworks & Dependencies

| Library | Role | Why |
|---|---|---|
| **InsightFace** | Face detection (SCRFD) | State-of-the-art face detector; downloads pretrained ONNX weights automatically |
| **boxmot (BoT-SORT)** | Multi-object face tracking | Keeps stable track IDs across frames; handles brief occlusion via ReID |
| **TalkNet** (custom) | Audio-visual active speaker detection | Correlates mouth movement with MFCC audio features; works with single mic |
| **python_speech_features** | MFCC extraction | Required by TalkNet; produces 13-coefficient MFCCs at 10ms step |
| **Vosk** | Local streaming ASR | Offline, word-level timestamps, no cloud API needed |
| **sounddevice** | Microphone capture | 16kHz mono, 100ms block callbacks |
| **FastAPI + uvicorn** | WebSocket server | Async; handles frame stream from extension + sends attributed words back |
| **OpenCV** | JPEG decode + crop | Frame decoding, grayscale conversion, resize |
| **PyTorch** | TalkNet inference | MPS backend on Apple Silicon for ~3–5x CPU speedup |

---

## Key Design Decisions

### Single monotonic clock
Both threads timestamp everything with `time.monotonic()` from a shared anchor set at startup. No message-passing protocol needed between threads — audio and video stay aligned purely through timestamps.

### TalkNet over lip optical flow
TalkNet uses audio (MFCC) AND visual (face crops) jointly. Audio fills the gap when faces are at an angle. Pure optical flow fails on side profiles; TalkNet degrades gracefully.

### BoT-SORT with high track_buffer
`track_buffer=60` keeps lost tracks alive for 2 seconds (at 30fps). For seated meetings where people rarely leave frame, this prevents ID reassignment from brief head turns.

### Person map locked at frame 30
At frame 30 (~1 second), the tracker is stable. Tracks are sorted left-to-right and permanently labeled `person_1` through `person_N`. This label never changes for the session.

### Single-thread frame executor
`ThreadPoolExecutor(max_workers=1)` serializes frame processing. Prevents race conditions on `_frame_count` and `_person_map` without locks, and avoids out-of-order frame processing.

### Weight key stripping
The pretrained weights (`pretrain_TalkSet.model`) were saved from a `talkNet` training wrapper that stores the model under `self.model`. All keys have a `model.` prefix. `asd/model.py` strips this prefix before loading into `talkNetModel` directly, skipping loss and optimizer state entirely.

---

## Stage Contracts

```
Extension → server:       binary WebSocket msg: JSON {"ts_ms": float, "frame": "<base64 JPEG>"}

tracker output:           {track_id: str, bbox: [x,y,w,h], crop: ndarray(224,224), ts_ms: float}

asd output:               {track_id: str, prob: float, ts_ms: float}   (every 200ms per track)

transcriber output:       {word: str, start_ms: float, end_ms: float}   (per utterance boundary)

server → extension:       {"event": "init", "speakers": ["person_1", ..., "person_N"]}  (once)
                          {"speaker": "person_2", "word": "hello", "start_ms": 1200, "end_ms": 1450}
```

All timestamps are **milliseconds since session start** (`time.monotonic()` anchor at `server.py` startup).

---

## Running

```bash
# Install dependencies
pip install -r requirements.txt

# Start the server (runs on ws://localhost:8765/ws)
python server.py
```

The server loads all models at startup (~5–15 seconds), then waits for the Chrome extension to connect.

### CPU Performance Warning

6 tracks × ~50ms per TalkNet forward pass = ~300ms for a 200ms window on pure CPU. The server auto-detects Apple Silicon and uses the MPS backend (`torch.backends.mps.is_available()`), which gives ~3–5x speedup and is sufficient for 6 tracks at 200ms cadence.

If running on CPU-only hardware, reduce `ASD_CADENCE_S` in `server.py` from `0.2` to `0.4` (400ms).

---

## Known Constraints

| Constraint | Notes |
|---|---|
| Small faces (<60px) | Lower `det_thresh` in `tracker.py` to `0.2`; or move camera closer |
| Full side profiles (90° yaw) | TalkNet handles better than optical flow; still degrades at extremes |
| Single mic for multiple speakers | Cannot separate voices — attribution is purely audio-visual |
| Cold start 1 second | First ~30 frames output `speaker: unknown` while tracker and ASD stabilize |
| Vosk model (lgraph) | Compressed graph model; slightly lower accuracy than full model. Swap `vosk-model/` with `vosk-model-en-us-0.22` for better accuracy |
