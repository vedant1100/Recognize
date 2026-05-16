"""
jaylogic diarization server — ws://localhost:8765/ws

One-time setup:
  1. pip install -r requirements.txt
  2. Copy asd/talkNet.py from https://github.com/sieve-community/fast-asd
  3. gdown --id 1AbN9fCf9IexMxEKXLQY2KYBlb-IhSEea        # pretrain_TalkSet.model

Extension → server (incoming):
  binary WebSocket message: JSON bytes {"ts_ms": float, "frame": "<base64 JPEG>"}

Server → extension (outgoing):
  {"event": "init", "speakers": ["person_1", ..., "person_N"]}   # sent once at frame 30
  {"speaker": "person_2", "word": "hello", "start_ms": 1200, "end_ms": 1450}
"""

import asyncio
import base64
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import torch
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from asd.inference import ASDInference, AudioRingBuffer
from asd.model import load_talknet
from asr.transcriber import GroqWhisperTranscriber
from sync.diarizer import Diarizer
from tracker.tracker import FaceTracker

# ── config ────────────────────────────────────────────────────────────────────
DOTENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=DOTENV_PATH, override=False)

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
TALKNET_WEIGHTS = "pretrain_TalkSet.model"
INIT_FRAMES = 30
ASD_CADENCE_S = 0.2
BOUNDING_BOXES = os.getenv("BOUNDING_BOXES", "true").strip().lower() == "true"
TRACKS_EVENT_EVERY_N_FRAMES = 4

SESSION_START_MS = time.monotonic() * 1000

# ── globals (assigned in lifespan) ───────────────────────────────────────────
tracker: FaceTracker
asd: ASDInference
audio_buf: AudioRingBuffer
transcriber: GroqWhisperTranscriber
diarizer: Diarizer

_frame_count = 0
_person_map: dict[str, str] = {}   # track_id -> "person_N", locked at frame 30
_custom_labels: dict[str, str] = {}  # "person_N" -> custom name
_latest_visible_named_labels: set[str] = set()
_person_map_locked = False
_last_resolved_person = "person_1"

_out_queue: asyncio.Queue = asyncio.Queue()
_feed_clients: set = set()   # dashboard WebSocket queues
_loop: asyncio.AbstractEventLoop
_frame_executor = ThreadPoolExecutor(max_workers=1)  # serialize frame processing


# ── background tasks ──────────────────────────────────────────────────────────

async def _asd_task() -> None:
    loop = asyncio.get_event_loop()
    while True:
        await asyncio.sleep(ASD_CADENCE_S)
        now_ms = time.monotonic() * 1000 - SESSION_START_MS
        audio = audio_buf.get_window(now_ms - 1000, now_ms)
        results = await loop.run_in_executor(None, asd.infer, audio, now_ms)
        diarizer.push_asd(results)


async def _word_task() -> None:
    loop = asyncio.get_event_loop()
    while True:
        word = await loop.run_in_executor(None, transcriber.get_word, 0.05)
        if word is None:
            continue
        attributed = diarizer.attribute(word)
        person_label = _resolve_person_label(attributed.get("speaker", "unknown"))
        attributed["speaker"] = _custom_labels.get(person_label, person_label)
        await _out_queue.put(attributed)
        # Fan-out to dashboard clients
        for q in list(_feed_clients):
            await q.put(attributed)


# ── lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global tracker, asd, audio_buf, transcriber, diarizer, _loop

    _loop = asyncio.get_running_loop()

    print(f"[server] loading models on {DEVICE}...")
    tracker = FaceTracker(det_thresh=0.3, device=DEVICE)
    talknet_model = load_talknet(TALKNET_WEIGHTS, device=DEVICE)
    asd = ASDInference(talknet_model, device=DEVICE)
    audio_buf = AudioRingBuffer()
    transcriber = GroqWhisperTranscriber(audio_buf, session_start_ms=SESSION_START_MS)
    print("[server] ASR backend: Groq Whisper (whisper-large-v3-turbo)")
    diarizer = Diarizer()

    transcriber.start()
    print("[server] ready on ws://localhost:8765/ws")

    asyncio.create_task(_asd_task())
    asyncio.create_task(_word_task())

    yield

    transcriber.stop()


app = FastAPI(lifespan=lifespan)


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    session_words: list[dict] = []

    # Flush stale messages from a previous connection
    while not _out_queue.empty():
        _out_queue.get_nowait()

    loop = asyncio.get_event_loop()
    drain = asyncio.create_task(_drain_to(ws, session_words))

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            if msg.get("event") == "set_name":
                _handle_set_name(msg)
                continue
            jpeg = base64.b64decode(msg["frame"])
            await loop.run_in_executor(_frame_executor, _process_frame, jpeg, float(msg["ts_ms"]))
    except WebSocketDisconnect:
        pass
    finally:
        drain.cancel()
        _save_transcript(session_words)


async def _drain_to(ws: WebSocket, session_words: list[dict]) -> None:
    while True:
        msg = await _out_queue.get()
        if "word" in msg:
            session_words.append(
                {
                    "speaker": msg.get("speaker", "unknown"),
                    "word": msg.get("word", ""),
                    "start_ms": msg.get("start_ms"),
                    "end_ms": msg.get("end_ms"),
                }
            )
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            break  # connection gone; drop the message


def _save_transcript(session_words: list[dict]) -> None:
    if not session_words:
        print("[server] no transcript words captured for this stream")
        return

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    transcripts_dir = Path(__file__).resolve().parent / "transcripts"
    transcripts_dir.mkdir(exist_ok=True)
    out_path = transcripts_dir / f"transcript_{ts}.txt"
    with out_path.open("w", encoding="utf-8") as f:
        for row in session_words:
            start_ms = row.get("start_ms")
            end_ms = row.get("end_ms")
            f.write(
                f"{row['speaker']}: {row['word']} "
                f"[{start_ms if start_ms is not None else '-'}-{end_ms if end_ms is not None else '-'}]\n"
            )
    print(f"[server] transcript saved: {out_path}")


def _handle_set_name(msg: dict) -> None:
    speaker = str(msg.get("speaker", "")).strip()
    name = str(msg.get("name", "")).strip()
    if not speaker.startswith("person_"):
        return
    if name:
        _custom_labels[speaker] = name
    elif speaker in _custom_labels:
        del _custom_labels[speaker]


def _resolve_person_label(raw_speaker: str) -> str:
    """
    Resolve diarizer output to a stable person label and never return 'unknown'.
    """
    global _last_resolved_person

    mapped = _person_map.get(raw_speaker, raw_speaker)
    if isinstance(mapped, str) and mapped.startswith("person_"):
        _last_resolved_person = mapped
        return mapped

    # If diarizer emitted unknown/unmapped, continue last known speaker.
    if _last_resolved_person.startswith("person_"):
        return _last_resolved_person

    # Fallback to first known person if available.
    if _person_map:
        people = sorted(set(_person_map.values()), key=lambda p: int(p.split("_")[1]))
        if people:
            _last_resolved_person = people[0]
            return people[0]

    # Absolute fallback before person map lock.
    _last_resolved_person = "person_1"
    return "person_1"


# ── frame processing (runs in _frame_executor, single thread) ─────────────────

def _process_frame(jpeg: bytes, ts_ms: float) -> None:
    global _frame_count, _person_map, _person_map_locked, _latest_visible_named_labels

    frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        return
    frame_h, frame_w = frame.shape[:2]

    tracks = tracker.update(frame, ts_ms)
    asd.push_crops(tracks)
    _frame_count += 1

    if not _person_map_locked and _frame_count >= INIT_FRAMES and tracks:
        sorted_tracks = sorted(tracks, key=lambda t: t["bbox"][0])
        _person_map = {t["track_id"]: f"person_{i + 1}" for i, t in enumerate(sorted_tracks)}
        _person_map_locked = True
        init_msg = {"event": "init", "speakers": list(_person_map.values())}
        _loop.call_soon_threadsafe(_out_queue.put_nowait, init_msg)
        for q in list(_feed_clients):
            _loop.call_soon_threadsafe(q.put_nowait, init_msg)
        print(f"[server] locked person map: {_person_map}")
    elif _person_map_locked and tracks:
        # Assign labels to track IDs that appeared after initialization (late joins)
        new_tracks = [t for t in tracks if t["track_id"] not in _person_map]
        if new_tracks:
            n = len(_person_map)
            for t in new_tracks:
                n += 1
                _person_map[t["track_id"]] = f"person_{n}"
            print(f"[server] late-join tracks assigned: { {t['track_id']: _person_map[t['track_id']] for t in new_tracks} }")

    _latest_visible_named_labels = {
        _custom_labels[_person_map[t["track_id"]]]
        for t in tracks
        if t["track_id"] in _person_map and _person_map[t["track_id"]] in _custom_labels
    }

    if _person_map_locked and (_frame_count % TRACKS_EVENT_EVERY_N_FRAMES == 0):
        tracks_msg = {
            "event": "tracks",
            "bounding_boxes": BOUNDING_BOXES,
            "frame_w": frame_w,
            "frame_h": frame_h,
            "tracks": [
                {
                    "track_id": t["track_id"],
                    "speaker": _person_map.get(t["track_id"], "unknown"),
                    "name": _custom_labels.get(_person_map.get(t["track_id"], ""), ""),
                    "bbox": t["bbox"],
                }
                for t in tracks
                if t["track_id"] in _person_map
            ],
        }
        _loop.call_soon_threadsafe(_out_queue.put_nowait, tracks_msg)



# ── Dashboard feed (read-only WebSocket for the React frontend) ───────────────

@app.websocket("/feed")
async def feed_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    q: asyncio.Queue = asyncio.Queue()
    _feed_clients.add(q)
    try:
        while True:
            msg = await q.get()
            await ws.send_text(json.dumps(msg))
    except Exception:
        pass
    finally:
        _feed_clients.discard(q)


# ── CORS (allow React dev server at localhost:5173) ───────────────────────────

from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


if __name__ == "__main__":
    uvicorn.run("server:app", host="localhost", port=8765, log_level="info")
