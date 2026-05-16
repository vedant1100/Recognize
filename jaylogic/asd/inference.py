import threading
import numpy as np
import torch
from collections import deque
from python_speech_features import mfcc as compute_mfcc

SAMPLE_RATE = 16000
CROPS_PER_WINDOW = 25   # 1s at 25fps
MFCC_FRAMES = 100       # 1s at 10ms step


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


class ASDInference:
    """Per-track crop ring buffers + windowed TalkNet inference."""

    def __init__(self, model: torch.nn.Module, device: str = "cpu"):
        self._model = model
        self._device = device
        self._crop_bufs: dict[str, deque] = {}
        self._lock = threading.Lock()

    def push_crops(self, tracks: list[dict]) -> None:
        with self._lock:
            active = {t["track_id"] for t in tracks}
            for t in tracks:
                tid = t["track_id"]
                if tid not in self._crop_bufs:
                    self._crop_bufs[tid] = deque(maxlen=CROPS_PER_WINDOW)
                self._crop_bufs[tid].append(t["crop"])
            for tid in list(self._crop_bufs):
                if tid not in active:
                    del self._crop_bufs[tid]

    def infer(self, audio_samples: np.ndarray, ts_ms: float) -> list[dict]:
        """
        Run TalkNet for all active tracks against the given audio window.
        Returns [{track_id, prob, ts_ms}]. prob >= 0 means speaking.
        """
        mfcc_feat = _audio_to_mfcc(audio_samples)

        with self._lock:
            snapshot = {tid: list(buf) for tid, buf in self._crop_bufs.items()}

        results = []
        for tid, crops in snapshot.items():
            if len(crops) < 5:
                continue  # insufficient history; diarizer sees no entry → word gets "unknown"
            try:
                score = self._forward(crops, mfcc_feat)
                results.append({"track_id": tid, "prob": float(score), "ts_ms": ts_ms})
            except Exception:
                pass

        return results

    def _forward(self, crops: list[np.ndarray], mfcc_feat: np.ndarray) -> float:
        # talkNetModel.forward_visual_frontend expects (B, T, W, H) raw float values;
        # it normalizes internally with (x/255 - 0.4161) / 0.1688
        crops_t = (
            torch.from_numpy(np.stack(crops)).float().unsqueeze(0).to(self._device)
        )  # (1, T, 224, 224)

        mfcc_t = (
            torch.from_numpy(mfcc_feat).float().unsqueeze(0).to(self._device)
        )  # (1, 100, 13)

        with torch.no_grad():
            a = self._model.forward_audio_frontend(mfcc_t)
            v = self._model.forward_visual_frontend(crops_t)
            a, v = self._model.forward_cross_attention(a, v)
            out = self._model.forward_audio_visual_backend(a, v)

        return float(out.mean())


def _audio_to_mfcc(samples: np.ndarray) -> np.ndarray:
    audio = samples.astype(np.float64) / 32768.0
    feat = compute_mfcc(audio, SAMPLE_RATE, numcep=13, winlen=0.025, winstep=0.010)
    if len(feat) >= MFCC_FRAMES:
        return feat[:MFCC_FRAMES]
    return np.pad(feat, ((0, MFCC_FRAMES - len(feat)), (0, 0)))
