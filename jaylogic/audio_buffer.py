"""Thread-safe ring buffer for PCM audio chunks."""

import threading
from collections import deque

import numpy as np

SAMPLE_RATE = 16000


class AudioRingBuffer:
    """Thread-safe store of int16 PCM chunks keyed by session-relative ms."""

    _CHUNK_MS = 100  # 1600 samples at 16kHz

    def __init__(self, max_duration_ms: int = 10_000):
        self._max_ms = max_duration_ms
        self._buf: deque[tuple[float, np.ndarray]] = deque()
        self._lock = threading.Lock()

    def push(self, pcm_bytes: bytes, ts_ms: float) -> None:
        samples = np.frombuffer(pcm_bytes, dtype=np.int16).copy()
        with self._lock:
            self._buf.append((ts_ms, samples))
            cutoff = ts_ms - self._max_ms
            while self._buf and self._buf[0][0] < cutoff:
                self._buf.popleft()

    def get_window(self, start_ms: float, end_ms: float) -> np.ndarray:
        """Concatenated int16 samples covering [start_ms, end_ms]."""
        with self._lock:
            chunks = [
                s
                for ts, s in self._buf
                if ts + self._CHUNK_MS >= start_ms and ts <= end_ms + self._CHUNK_MS
            ]
        if not chunks:
            n = int((end_ms - start_ms) / 1000 * SAMPLE_RATE)
            return np.zeros(n, dtype=np.int16)
        return np.concatenate(chunks)
