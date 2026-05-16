# jaylogic ASD Diarization Pipeline

## Overview

Real-time speaker diarization pipeline. Video: extension captures Google Meet tab (room camera tile) and streams frames for face tracking (SCRFD + BoT-SORT) + active speaker detection (TalkNet via Fast-ASD). Audio: Python captures mic directly and runs Vosk for word timestamps. The two pipelines share a monotonic clock and merge at the end: for each transcribed word, find which tracked face TalkNet said was speaking during that window.

---

## Capture Method

- **Video:** Extension captures the Google Meet tab using `chrome.tabCapture`, sends JPEG frames over WebSocket to the server. The room camera tile (all 6 people in one shot) is visible in the captured tab.
- **Audio:** Python captures the microphone directly with `sounddevice` at 16kHz mono. Runs in a separate thread from the video pipeline.
- **Shared clock:** Both pipelines timestamp everything using `time.monotonic()` anchored at `server.py` startup. This is the only coordination point between the two threads.

---

## Complete Step-by-Step Flow

### 0. Startup (before meeting begins)

1. User runs `python server.py` on their machine
2. Server loads TalkNet weights from `pretrain_TalkSet.model` into memory
3. Server loads SCRFD face detection model via InsightFace
4. Server loads Vosk language model from disk (~5–15 seconds for large model)
5. Server starts listening on `ws://localhost:8765`
6. `SESSION_START_MS = time.monotonic() * 1000` — the shared clock anchor is set
7. Audio capture thread starts: `sounddevice` opens the mic at 16kHz mono, starts writing PCM chunks into a shared `audio_ring_buffer` with timestamps
8. Extension connects to `ws://localhost:8765`

### 1. Initialization — who is who (first ~1 second)

9. Extension uses `chrome.tabCapture` to grab the Meet tab video stream
10. Extension sends the first JPEG frame over WebSocket with `ts_ms = 0`
11. Server decodes JPEG → numpy frame
12. SCRFD runs on frame → finds N face bounding boxes
13. BoT-SORT receives detections → assigns track IDs (1, 2, 3... N) for the first time
14. This repeats for frames 1–30 (~1 second at 30fps), allowing BoT-SORT to stabilize
15. At frame 30: server reads the current stable tracks, sorts them **left-to-right by bbox x-coordinate**, and locks the mapping: `track_id → person_1, person_2, ... person_N`. This mapping never changes for the rest of the session.
16. Server emits `{"event": "init", "speakers": ["person_1", "person_2", ..., "person_6"]}` to extension. Extension renders the labels on screen.

### 2. Continuous video processing loop (every frame, ~30fps)

For each incoming JPEG frame from the extension:

17. Decode JPEG → numpy frame
18. SCRFD detects face bounding boxes in the frame
20. BoT-SORT matches detections to existing tracks using IoU + Kalman prediction → outputs `{track_id, bbox}` for each face. New track IDs that appear after initialization get `person_{N+1}`, `person_{N+2}` etc.
21. For each track: crop the face region from the frame, add padding (40% of bbox size), resize to 224×224, convert to grayscale → push crop into that track's **face crop ring buffer** (holds last 25 crops = 1 second of 25fps video)
22. Record `{track_id, bbox, ts_ms}` in the **speaker timeline buffer**

### 3. TalkNet ASD inference (every 200ms, separate timer)

Every 200ms wall-clock time:

23. For each track (up to 6):
    - Pull the last 25 grayscale face crops from that track's ring buffer
    - Pull the audio bytes from `audio_ring_buffer` covering the same `[ts_now - 1000ms, ts_now]` window using wall-clock timestamps
    - Convert audio to MFCC features using `python_speech_features.mfcc(audio, 16000, numcep=13, winlen=0.025, winstep=0.010)` → shape `(100, 13)` (100 MFCC frames per second)
    - Run TalkNet forward pass: `forward_audio_frontend(mfcc)` + `forward_visual_frontend(crops)` + `forward_cross_attention()` + `forward_audio_visual_backend()` → raw score
    - Score ≥ 0 = speaking, score < 0 = silent. Record `{track_id: "person_2", prob: score, ts_ms: ts_now}` in **speaker timeline**
24. Speaker timeline is a `deque` keyed by `ts_ms`, storing `{person_id → prob}` for each 200ms window. Kept for last 10 seconds, older entries discarded.

### 4. Continuous audio processing loop (parallel, independent thread)

Running in parallel to steps 17–24, completely independent:

25. `sounddevice` callback fires every ~100ms with a chunk of 1600 PCM samples (100ms at 16kHz)
26. Chunk is written into `audio_ring_buffer` with `ts_ms = (time.monotonic() * 1000) - SESSION_START_MS`
27. Same chunk is fed to `vosk_recognizer.AcceptWaveform(chunk)`
28. Vosk returns one of two things:
    - `partial_result()` → in-progress speech, no timestamps yet. Ignored.
    - `result()` → utterance complete (Vosk detected a pause). Contains `{"result": [{"word": "hello", "start": 1.2, "end": 1.45}, ...]}`. Word timestamps are in seconds from audio start.
29. Convert Vosk's timestamps to session-relative ms: `start_ms = word["start"] * 1000`, `end_ms = word["end"] * 1000`
30. Push each word as `{word: "hello", start_ms: 1200, end_ms: 1450}` into the **word queue**

### 5. Sync — attributing each word to a speaker

Whenever a word lands in the word queue:

31. Check: `if end_ms < 1000` → emit `{speaker: "unknown", ...}` (cold start window, ASD not reliable yet)
32. Look up the speaker timeline for all entries where `ts_ms` falls within `[word.start_ms - 200, word.end_ms + 200]` (small buffer to account for ASD lag)
33. For each person, average their `prob` values across all timeline entries in that window
34. `winner = argmax({person_1: avg_prob, person_2: avg_prob, ...})`
35. Check confidence floor: `if max(avg_prob) < 0.3` → emit `{speaker: "unknown"}`
36. Otherwise: emit `{speaker: "person_2", word: "hello", start_ms: 1200, end_ms: 1450}`

### 6. Output to extension

37. Server sends JSON over WebSocket to extension: `{"speaker": "person_2", "word": "hello", "start_ms": 1200, "end_ms": 1450}`
38. Extension receives it and appends to the live transcript display: **person_2: "hello"**
39. When the host's name mapping is applied, `person_2` is replaced with the real name

---

## Thread Summary

```
Thread 1 (video):   Extension → JPEG frames → SCRFD → BoT-SORT → crop ring buffers
                    └─ every 200ms: TalkNet(crops + audio slice) → speaker timeline

Thread 2 (audio):   Mic → PCM chunks → audio_ring_buffer  (read by Thread 1 for TalkNet)
                    └─ also: Vosk(chunks) → word_queue     (read by sync in Thread 1)

Sync (in Thread 1, triggered by word_queue):
                    word_queue + speaker_timeline → attributed word → WebSocket → extension
```

Shared state between threads (both thread-safe `collections.deque` with locks):
- `audio_ring_buffer` — Thread 2 writes, Thread 1 reads
- `word_queue` — Thread 2 writes, Thread 1 reads

---

## File Structure

```
recognize/jaylogic/
├── PIPELINE.md              # this file
├── requirements.txt
├── server.py                # FastAPI + WebSocket server on localhost:8765; wires all stages
├── tracker/
│   └── tracker.py           # SCRFD detection + BoT-SORT, outputs {track_id, bbox, crop, ts_ms}
├── asd/
│   ├── model.py             # TalkNet model definition + weight loading
│   └── inference.py         # crop ring buffer + audio ring buffer + windowed inference per track
├── asr/
│   └── transcriber.py       # Vosk streaming on mic → {word, start_ms, end_ms}
└── sync/
    └── diarizer.py          # argmax speaker over word window + confidence floor + unknown handling
```

---

## Stage Contracts

- **extension → server:** JPEG frame bytes + `ts_ms` (ms since session start) over WebSocket
- **tracker output:** `{track_id: str, bbox: [x,y,w,h], crop: np.ndarray, ts_ms: float}` per frame
- **asd output:** `{track_id: str, prob: float, ts_ms: float}` emitted every 200ms per track
- **asr output:** `{word: str, start_ms: float, end_ms: float}` per utterance boundary
- **sync → extension:** `{speaker: "person_1", word: "hello", start_ms: 1200, end_ms: 1450}`

All timestamps are milliseconds since session start (`time.monotonic()` anchor set at `server.py` startup).

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `insightface` | SCRFD face detection |
| `boxmot` | BoT-SORT tracker |
| `torch`, `torchaudio` | TalkNet model inference |
| `python_speech_features` | MFCC audio features (required by TalkNet) |
| `scipy` | Signal processing for audio |
| `vosk` | Local streaming ASR with word timestamps |
| `sounddevice` | Microphone capture at 16kHz mono |
| `fastapi`, `uvicorn`, `websockets` | WebSocket server |
| `opencv-python` | Frame decoding and crop operations |

---

## What we use from Fast-ASD

Fast-ASD (`github.com/sieve-community/fast-asd`) contains an optimized TalkNet implementation. Its key improvements over the original TalkNet repo:
- Variable FPS support — handles 30fps natively, no frame dropping needed
- In-memory frame processing — no temp files written to disk
- Faster preprocessing

We use Fast-ASD's **optimized `talkNet.py`** and its pretrained weights. We skip `demoTalkNet.py` (the file-based batch demo) and replace it with our own streaming wrapper.

- **Copy `talkNet.py`** from Fast-ASD repo into `asd/`
- **Download weights** via `gdown --id 1AbN9fCf9IexMxEKXLQY2KYBlb-IhSEea`
- **Write `asd/inference.py`** as a live streaming adapter: consumes in-memory crops + audio ring buffer, returns speaking prob per track every 200ms

We do NOT use: `S3FD` detector (replaced by SCRFD), `track_shot()` (replaced by BoT-SORT), hardcoded `.cuda()` calls (replaced by `.to(device)` for CPU/MPS).

---

## Known Pitfalls and Mitigations

### Solvable with implementation care

| Pitfall | Mitigation |
|---|---|
| FPS mismatch | Not a concern — Fast-ASD handles variable FPS natively. Feed 30fps frames directly. |
| Audio-face alignment drift | Single `time.monotonic()` clock; audio ring buffer keyed by wall-clock ts, not frame count |
| Cold start (first 1 second) | Emit `speaker: "unknown"` for all words with `end_ms < 1000` |
| argmax fires during silence | Confidence floor: if `max(prob) < 0.3` → emit `speaker: "unknown"` |
| Vosk timestamps arrive at utterance end | Hold words in sync queue until ASD timeline covers the full word window |
| BoT-SORT ID loss on brief occlusion | Tune `track_buffer` higher than default; acceptable for seated meetings |
| Person label ordering | At frame 30, sort stable tracks left-to-right, lock `person_1..N` mapping permanently |

### CPU throughput — benchmark first

6 tracks × ~50ms per TalkNet inference = ~300ms per 200ms window on CPU — pipeline falls behind.

- **Level 1:** PyTorch MPS backend on Apple Silicon — 3–5x speedup, likely sufficient
- **Level 2:** Reduce inference cadence from 200ms to 400ms
- **Level 3:** Batch all 6 tracks in one forward pass
- **Level 4 (last resort):** Fall back to lip optical flow per-track

**Benchmark on the actual host machine as step one of building `asd/`.**

### Fundamental hardware constraints

| Constraint | Notes |
|---|---|
| Small faces (<60px) in wide-angle shot | Lower SCRFD `det_thresh` to 0.3, add bbox padding. Root fix: camera closer or higher-res sensor. |
| Full side profiles (90° yaw) | TalkNet handles better than optical flow (audio fills gap), but accuracy still degrades. For no-overlap speech, attribution still works. Known constraint of single-camera + single-mic. |

---

## Output Format

Streamed word-by-word over WebSocket:

```json
{"speaker": "person_1", "word": "hello", "start_ms": 500, "end_ms": 720}
{"speaker": "person_2", "word": "hey", "start_ms": 950, "end_ms": 1100}
{"speaker": "unknown", "word": "hmm", "start_ms": 1300, "end_ms": 1400}
```

---

## Build Order

1. `tracker/tracker.py` — SCRFD + BoT-SORT, verify persistent IDs survive head turns on a test video
2. `asd/` — benchmark TalkNet CPU throughput for 6 tracks first; apply Level 1–3 mitigations if needed
3. `asr/transcriber.py` — Vosk streaming on mic, verify word + timestamp output
4. `sync/diarizer.py` — hold buffer + argmax + confidence floor (~60 lines)
5. `server.py` — two threads, shared audio ring buffer, shared monotonic clock, WebSocket output
