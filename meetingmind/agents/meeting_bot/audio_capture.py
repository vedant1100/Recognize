"""
Chunks the incoming audio stream and dispatches to:
  - Nosana GPU for diarization (who is speaking when)
  - Deepgram for ASR (what was said)
"""
import asyncio
import base64
import httpx
from collections import deque

from config import NOSANA_GPU_ENDPOINT, DEEPGRAM_API_KEY, AUDIO_CHUNK_SECONDS, AUDIO_CHUNK_OVERLAP_SECONDS

SAMPLE_RATE = 16000  # Hz — mono PCM expected from Meet
BYTES_PER_SAMPLE = 2  # 16-bit PCM


async def _diarize_chunk(audio_bytes: bytes) -> list[dict]:
    """POST audio chunk to Nosana diarizer. Returns [{speaker, start_ms, end_ms}]."""
    encoded = base64.b64encode(audio_bytes).decode()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{NOSANA_GPU_ENDPOINT}/diarize",
            json={"audio_b64": encoded, "sample_rate": SAMPLE_RATE},
        )
        resp.raise_for_status()
        return resp.json()["segments"]


async def _transcribe_segment(audio_bytes: bytes) -> str:
    """Sends audio segment to Deepgram Nova-2 and returns transcript text."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.deepgram.com/v1/listen?model=nova-2&language=en",
            content=audio_bytes,
            headers={
                "Authorization": f"Token {DEEPGRAM_API_KEY}",
                "Content-Type": "audio/raw;encoding=linear16;sample_rate=16000;channels=1",
            },
        )
        resp.raise_for_status()
        return resp.json()["results"]["channels"][0]["alternatives"][0]["transcript"]


async def process_audio_stream(audio_track, on_segment):
    """
    Reads from aiortc audio_track, builds overlapping chunks, diarizes + transcribes.
    Calls on_segment({speaker_label, start_ms, end_ms, text}) for each attributed segment.
    """
    chunk_bytes = AUDIO_CHUNK_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE
    overlap_bytes = AUDIO_CHUNK_OVERLAP_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE

    buffer = bytearray()
    chunk_start_ms = 0

    # TODO: Replace with actual aiortc frame reading loop:
    # async for frame in audio_track:
    #     buffer.extend(frame.to_ndarray().tobytes())
    #     ...

    while len(buffer) >= chunk_bytes:
        chunk = bytes(buffer[:chunk_bytes])
        buffer = buffer[chunk_bytes - overlap_bytes:]

        segments = await _diarize_chunk(chunk)
        for seg in segments:
            text = await _transcribe_segment(
                chunk[
                    int(seg["start_ms"] / 1000 * SAMPLE_RATE * BYTES_PER_SAMPLE):
                    int(seg["end_ms"] / 1000 * SAMPLE_RATE * BYTES_PER_SAMPLE)
                ]
            )
            if text.strip():
                await on_segment({
                    "speaker_label": seg["speaker"],
                    "start_ms": chunk_start_ms + seg["start_ms"],
                    "end_ms": chunk_start_ms + seg["end_ms"],
                    "text": text.strip(),
                })

        chunk_start_ms += (AUDIO_CHUNK_SECONDS - AUDIO_CHUNK_OVERLAP_SECONDS) * 1000
