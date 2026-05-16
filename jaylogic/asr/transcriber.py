import io
import os
import queue
import threading
import time
import wave
from typing import Any

import requests
import sounddevice as sd

SAMPLE_RATE   = 16000
BLOCK_SAMPLES = int(SAMPLE_RATE * 0.1)   # 100 ms chunks = 1 600 samples


class BaseMicrophoneTranscriber:
    """Captures microphone audio and emits {word, start_ms, end_ms}."""

    def __init__(self, audio_ring_buffer, session_start_ms: float = 0.0):
        self._audio_buf        = audio_ring_buffer
        self._session_start_ms = session_start_ms
        self._word_queue: queue.Queue = queue.Queue()
        self._sd_stream: sd.RawInputStream | None = None
        self._first_audio_ts: float | None = None

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def start(self) -> None:
        self._sd_stream = sd.RawInputStream(
            samplerate=SAMPLE_RATE,
            blocksize=BLOCK_SAMPLES,
            dtype="int16",
            channels=1,
            callback=self._sd_callback,
        )
        self._sd_stream.start()

    def stop(self) -> None:
        if self._sd_stream is not None:
            self._sd_stream.stop()
            self._sd_stream.close()
            self._sd_stream = None

    # ── Audio ingestion ────────────────────────────────────────────────────────

    def _sd_callback(self, indata, frames, time_info, status) -> None:
        ts_ms = time.monotonic() * 1000 - self._session_start_ms
        self._push(bytes(indata), ts_ms)

    def _push(self, pcm_bytes: bytes, ts_ms: float) -> None:
        if self._first_audio_ts is None:
            self._first_audio_ts = ts_ms

        self._audio_buf.push(pcm_bytes, ts_ms)
        self._process_chunk(pcm_bytes, ts_ms)

    def _process_chunk(self, pcm_bytes: bytes, ts_ms: float) -> None:
        raise NotImplementedError

    def _emit_word(self, word: str, start_ms: float, end_ms: float) -> None:
        self._word_queue.put({
            "word": word,
            "start_ms": start_ms,
            "end_ms": end_ms,
        })

    # ── Word output ────────────────────────────────────────────────────────────

    def get_word(self, timeout: float = 0.05) -> dict | None:
        try:
            return self._word_queue.get(timeout=timeout)
        except queue.Empty:
            return None


class GroqWhisperTranscriber(BaseMicrophoneTranscriber):
    """
    Groq Whisper ASR (whisper-large-v3-turbo) with periodic chunk uploads.
    Emits best-effort word timestamps from Whisper verbose JSON.
    """

    def __init__(self, audio_ring_buffer, session_start_ms: float = 0.0):
        super().__init__(audio_ring_buffer=audio_ring_buffer, session_start_ms=session_start_ms)
        self._api_key = os.getenv("GROQ_API_KEY", "").strip()
        if not self._api_key:
            raise RuntimeError("GROQ_API_KEY is not set")

        self._endpoint = "https://api.groq.com/openai/v1/audio/transcriptions"
        self._model = os.getenv("WHISPER_MODEL", "whisper-large-v3-turbo")
        self._language = os.getenv("WHISPER_LANGUAGE", "en")
        self._window_s = float(os.getenv("WHISPER_WINDOW_S", "3.0"))
        self._stride_s = float(os.getenv("WHISPER_STRIDE_S", "3.2"))
        self._dedupe_margin_ms = float(os.getenv("WHISPER_DEDUPE_MARGIN_MS", "60"))
        self._max_retries = int(os.getenv("WHISPER_MAX_RETRIES", "3"))
        self._max_pending_jobs = int(os.getenv("WHISPER_MAX_PENDING_JOBS", "2"))

        self._lock = threading.Lock()
        self._pcm_accum = bytearray()
        self._last_upload_t = 0.0
        self._last_uploaded_audio_end_ms = 0.0
        self._last_emitted_end_ms = -1.0
        self._cooldown_until = 0.0
        self._request_jobs: queue.Queue = queue.Queue()
        self._stop_event = threading.Event()
        self._worker_thread: threading.Thread | None = None

    def start(self) -> None:
        self._stop_event.clear()
        self._worker_thread = threading.Thread(
            target=self._worker_loop,
            name="groq-whisper-worker",
            daemon=True,
        )
        self._worker_thread.start()
        super().start()

    def _process_chunk(self, pcm_bytes: bytes, ts_ms: float) -> None:
        with self._lock:
            self._pcm_accum.extend(pcm_bytes)

        now = time.monotonic()
        if now < self._cooldown_until:
            return
        if now - self._last_upload_t >= self._stride_s:
            self._last_upload_t = now
            self._enqueue_window()

    def stop(self) -> None:
        # Flush one final chunk request before stopping.
        try:
            self._enqueue_window(force=True)
        except Exception:
            pass
        self._stop_event.set()
        if self._worker_thread is not None:
            self._worker_thread.join(timeout=2.0)
            self._worker_thread = None
        super().stop()

    def _enqueue_window(self, force: bool = False) -> None:
        if self._request_jobs.qsize() >= self._max_pending_jobs and not force:
            return

        with self._lock:
            max_bytes = int(SAMPLE_RATE * 2 * self._window_s)
            if not force and len(self._pcm_accum) < int(SAMPLE_RATE * 2 * 1.0):
                return
            if len(self._pcm_accum) > max_bytes:
                window_pcm = bytes(self._pcm_accum[-max_bytes:])
            else:
                window_pcm = bytes(self._pcm_accum)

        audio_end_ms = time.monotonic() * 1000 - self._session_start_ms
        audio_len_ms = (len(window_pcm) / 2 / SAMPLE_RATE) * 1000.0
        audio_start_ms = max(0.0, audio_end_ms - audio_len_ms)
        if audio_end_ms <= self._last_uploaded_audio_end_ms and not force:
            return

        self._request_jobs.put(
            {
                "pcm": window_pcm,
                "audio_start_ms": audio_start_ms,
                "audio_end_ms": audio_end_ms,
            }
        )

    def _worker_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                job = self._request_jobs.get(timeout=0.2)
            except queue.Empty:
                continue

            now = time.monotonic()
            if now < self._cooldown_until:
                continue

            payload = self._call_groq_with_retry(job["pcm"])
            if payload is None:
                continue

            self._emit_from_payload(payload, job["audio_start_ms"])
            self._last_uploaded_audio_end_ms = job["audio_end_ms"]

    def _call_groq(self, pcm_window: bytes) -> dict[str, Any]:
        wav_bytes = self._pcm_to_wav(pcm_window)
        headers = {"Authorization": f"Bearer {self._api_key}"}
        files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
        data = {
            "model": self._model,
            "language": self._language,
            "response_format": "verbose_json",
            "timestamp_granularities[]": "word",
        }

        resp = requests.post(self._endpoint, headers=headers, files=files, data=data, timeout=45)
        resp.raise_for_status()
        return resp.json()

    def _call_groq_with_retry(self, pcm_window: bytes) -> dict[str, Any] | None:
        delay_s = 1.0
        for attempt in range(self._max_retries + 1):
            try:
                return self._call_groq(pcm_window)
            except requests.HTTPError as err:
                status = err.response.status_code if err.response is not None else None
                if status == 429:
                    retry_after = self._parse_retry_after_seconds(err.response)
                    wait_s = retry_after if retry_after is not None else delay_s
                    self._cooldown_until = time.monotonic() + wait_s
                    print(f"[asr] Groq 429 rate limited. Cooling down for {wait_s:.2f}s")
                    time.sleep(wait_s)
                    delay_s = min(delay_s * 2, 30.0)
                    continue
                if 500 <= (status or 0) < 600 and attempt < self._max_retries:
                    time.sleep(delay_s)
                    delay_s = min(delay_s * 2, 10.0)
                    continue
                print(f"[asr] Groq transcription HTTP error: {err}")
                return None
            except requests.RequestException as err:
                if attempt < self._max_retries:
                    time.sleep(delay_s)
                    delay_s = min(delay_s * 2, 10.0)
                    continue
                print(f"[asr] Groq transcription request failed: {err}")
                return None
        return None

    @staticmethod
    def _parse_retry_after_seconds(resp: requests.Response | None) -> float | None:
        if resp is None:
            return None
        val = resp.headers.get("retry-after")
        if not val:
            return None
        try:
            return max(0.0, float(val))
        except ValueError:
            return None

    @staticmethod
    def _pcm_to_wav(pcm_bytes: bytes) -> bytes:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm_bytes)
        return buf.getvalue()

    def _emit_from_payload(self, payload: dict[str, Any], base_start_ms: float) -> None:
        words = payload.get("words", [])
        if words:
            for w in words:
                token = (w.get("word") or "").strip()
                if not token:
                    continue
                start_ms = base_start_ms + float(w.get("start", 0.0)) * 1000.0
                end_ms = base_start_ms + float(w.get("end", w.get("start", 0.0))) * 1000.0
                if end_ms <= self._last_emitted_end_ms + self._dedupe_margin_ms:
                    continue
                self._emit_word(token, start_ms, end_ms)
                self._last_emitted_end_ms = end_ms
            return

        # Fallback when API response has no word-level timestamps.
        for seg in payload.get("segments", []):
            text = (seg.get("text") or "").strip()
            if not text:
                continue
            start_ms = base_start_ms + float(seg.get("start", 0.0)) * 1000.0
            end_ms = base_start_ms + float(seg.get("end", seg.get("start", 0.0))) * 1000.0
            if end_ms <= self._last_emitted_end_ms + self._dedupe_margin_ms:
                continue
            self._emit_word(text, start_ms, end_ms)
            self._last_emitted_end_ms = end_ms
