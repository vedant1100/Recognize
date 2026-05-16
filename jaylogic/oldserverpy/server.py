"""
jaylogic diarization server — ws://localhost:8765/ws

Two independent pipelines:
  1. Video: MediaPipe Face Mesh → lip movement → who's speaking
  2. Audio: Groq Whisper → transcribed words

Merge: when a word arrives, look up who was speaking during that window.

Extension → server (incoming):
  JSON: {"ts_ms": float, "frame": "<base64 JPEG>"}
  JSON: {"type": "audio", "ts_ms": float, "pcm": "<base64 int16>"}

Server → extension (outgoing):
  {"event": "init", "speakers": ["person_1", ..., "person_N"]}
  {"event": "tracks", ...}
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
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from audio_buffer import AudioRingBuffer
from asr.transcriber import GroqWhisperTranscriber
from lip.detector import LipSpeakerDetector
from sync.diarizer import Diarizer

# ── config ────────────────────────────────────────────────────────────────────
DOTENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=DOTENV_PATH, override=False)

INIT_FRAMES = 30
BOUNDING_BOXES = os.getenv("BOUNDING_BOXES", "true").strip().lower() == "true"
TRACKS_EVENT_EVERY_N_FRAMES = 4
ASR_SAMPLE_RATE = 16000

SESSION_START_MS = time.monotonic() * 1000

# ── globals (assigned in lifespan) ───────────────────────────────────────────
lip: LipSpeakerDetector
audio_buf: AudioRingBuffer
transcriber: GroqWhisperTranscriber
diarizer: Diarizer

_init_sent = False
_custom_labels: dict[str, str] = {}

_out_queue: asyncio.Queue = asyncio.Queue()
_feed_clients: set = set()
_loop: asyncio.AbstractEventLoop
_frame_executor = ThreadPoolExecutor(max_workers=1)
_audio_rate_logged = False


# ── background: word attribution ─────────────────────────────────────────────

async def _word_task() -> None:
    """Poll transcriber for words, attribute each to a speaker via lip timeline."""
    loop = asyncio.get_event_loop()
    while True:
        word = await loop.run_in_executor(None, transcriber.get_word, 0.05)
        if word is None:
            continue
        attributed = diarizer.attribute(word)
        # Apply custom name labels
        speaker = attributed.get("speaker", "unknown")
        attributed["speaker"] = _custom_labels.get(speaker, speaker)
        await _out_queue.put(attributed)
        for q in list(_feed_clients):
            await q.put(attributed)


# ── lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global lip, audio_buf, transcriber, diarizer, _loop

    _loop = asyncio.get_running_loop()

    print("[server] loading MediaPipe Face Mesh...")
    lip = LipSpeakerDetector(max_faces=6, mar_window=12, mar_threshold=0.0008)
    audio_buf = AudioRingBuffer()
    transcriber = GroqWhisperTranscriber(audio_buf, session_start_ms=SESSION_START_MS)
    diarizer = Diarizer(lip)
    print("[server] ASR backend: Groq Whisper (whisper-large-v3-turbo)")

    transcriber.start()
    print("[server] ready on ws://localhost:8765/ws")

    asyncio.create_task(_word_task())

    yield

    transcriber.stop()


app = FastAPI(lifespan=lifespan)


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    session_words: list[dict] = []
    global _audio_rate_logged

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

            if msg.get("type") == "audio":
                pcm_b64 = msg.get("pcm")
                if pcm_b64:
                    pcm = base64.b64decode(pcm_b64)
                    sample_rate = int(msg.get("sample_rate", ASR_SAMPLE_RATE))
                    if sample_rate <= 0:
                        raise ValueError(f"invalid sample_rate={sample_rate}")
                    if not _audio_rate_logged:
                        # Log first audio chunk details
                        samples = np.frombuffer(pcm, dtype=np.int16)
                        peak = int(np.max(np.abs(samples))) if len(samples) > 0 else 0
                        print(f"[server] incoming audio: rate={sample_rate}Hz, "
                              f"samples={len(samples)}, peak={peak}/32768, "
                              f"needs_resample={sample_rate != ASR_SAMPLE_RATE}")
                        _audio_rate_logged = True
                    if sample_rate != ASR_SAMPLE_RATE:
                        pcm = _resample_pcm_int16(pcm, from_rate=sample_rate, to_rate=ASR_SAMPLE_RATE)
                    transcriber.ingest_pcm(pcm, float(msg.get("ts_ms", 0.0)))
                continue

            # Video frame
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
            session_words.append({
                "speaker": msg.get("speaker", "unknown"),
                "word": msg.get("word", ""),
                "start_ms": msg.get("start_ms"),
                "end_ms": msg.get("end_ms"),
            })
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            break


def _save_transcript(session_words: list[dict]) -> None:
    if not session_words:
        print("[server] no transcript words captured for this stream")
        return

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    transcripts_dir = Path(__file__).resolve().parent / "transcripts"
    transcripts_dir.mkdir(exist_ok=True)
    out_path = transcripts_dir / f"transcript_{ts}.txt"

    # Build full transcript text (speaker-attributed)
    lines: list[str] = []
    for row in session_words:
        start_ms = row.get("start_ms")
        end_ms = row.get("end_ms")
        lines.append(
            f"{row['speaker']}: {row['word']} "
            f"[{start_ms if start_ms is not None else '-'}-{end_ms if end_ms is not None else '-'}]"
        )

    with out_path.open("w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"[server] transcript saved: {out_path}")

    # Upload transcript to backend for Neo4j ingestion
    _upload_transcript_to_backend(out_path, f"meeting_transcript_{ts}.txt")


def _upload_transcript_to_backend(filepath: Path, filename: str) -> None:
    """POST the transcript file to the backend /api/upload endpoint."""
    import requests

    backend_url = "http://localhost:8000/api/upload"
    try:
        with open(filepath, "rb") as f:
            resp = requests.post(
                backend_url,
                files={"file": (filename, f, "text/plain")},
                timeout=60,
            )
        if resp.status_code == 200:
            data = resp.json()
            print(f"[server] ✓ transcript uploaded to knowledge graph: "
                  f"{data.get('added', '?')} chunks, doc_id={data.get('doc_id', '?')}")
        else:
            print(f"[server] ✗ backend upload failed: {resp.status_code} {resp.text[:200]}")
    except requests.ConnectionError:
        print("[server] ✗ backend not reachable — transcript saved locally but not ingested")
    except Exception as e:
        print(f"[server] ✗ upload error: {e}")


def _handle_set_name(msg: dict) -> None:
    speaker = str(msg.get("speaker", "")).strip()
    name = str(msg.get("name", "")).strip()
    if not speaker.startswith("person_"):
        return
    print(f"[server] received set_name: {speaker} -> '{name}'")
    if name:
        _custom_labels[speaker] = name
        lip.set_name(speaker, name)
    else:
        _custom_labels.pop(speaker, None)
        lip.set_name(speaker, "")


def _resample_pcm_int16(pcm_bytes: bytes, from_rate: int, to_rate: int) -> bytes:
    if from_rate == to_rate:
        return pcm_bytes
    samples = np.frombuffer(pcm_bytes, dtype=np.int16)
    if samples.size == 0:
        return pcm_bytes
    out_len = int(round(samples.size * (float(to_rate) / float(from_rate))))
    if out_len <= 1:
        return np.zeros(1, dtype=np.int16).tobytes()
    x_old = np.arange(samples.size, dtype=np.float64)
    x_new = np.linspace(0.0, float(samples.size - 1), out_len, dtype=np.float64)
    out = np.interp(x_new, x_old, samples.astype(np.float64))
    out = np.clip(out, -32768.0, 32767.0).astype(np.int16)
    return out.tobytes()


# ── frame processing (runs in _frame_executor) ───────────────────────────────

def _process_frame(jpeg: bytes, ts_ms: float) -> None:
    global _init_sent

    frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        return

    frame_h, frame_w = frame.shape[:2]
    # Use server's own clock so lip timeline matches transcriber timestamps
    server_ts_ms = time.monotonic() * 1000 - SESSION_START_MS
    result = lip.process_frame(frame, server_ts_ms)

    # Send init event once after person map is locked
    if not _init_sent and lip.is_locked():
        speakers = lip.get_speakers()
        init_msg = {"event": "init", "speakers": speakers}
        _loop.call_soon_threadsafe(_out_queue.put_nowait, init_msg)
        for q in list(_feed_clients):
            _loop.call_soon_threadsafe(q.put_nowait, init_msg)
        _init_sent = True
        print(f"[server] locked person map: {speakers}")

    # Periodic tracks event for bounding box overlay + face count
    fc = result.get("frame_count", 0)
    if fc % TRACKS_EVENT_EVERY_N_FRAMES == 0:
        tracks_msg = {
            "event": "tracks",
            "bounding_boxes": BOUNDING_BOXES,
            "frame_w": frame_w,
            "frame_h": frame_h,
            "tracks": [
                {
                    "track_id": t["track_id"],
                    "speaker": t["speaker"],
                    "name": t.get("name", ""),
                    "bbox": t["bbox"],
                    "is_speaking": t.get("is_speaking", False),
                }
                for t in result["tracks"]
            ],
        }
        _loop.call_soon_threadsafe(_out_queue.put_nowait, tracks_msg)


# ── Dashboard feed ────────────────────────────────────────────────────────────

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


# ── CORS ──────────────────────────────────────────────────────────────────────

from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


if __name__ == "__main__":
    uvicorn.run("server:app", host="localhost", port=8765, log_level="info")
