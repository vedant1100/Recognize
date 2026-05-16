from collections import deque

COLD_START_MS = 1000.0
CONFIDENCE_FLOOR = 0.3
BUFFER_WINDOW_MS = 200.0
TIMELINE_MAX_MS = 10_000.0
PAUSE_RESET_MS = 900.0


class Diarizer:
    """Attributes transcribed words to speaker track IDs via ASD timeline lookup."""

    def __init__(
        self,
        confidence_floor: float = CONFIDENCE_FLOOR,
        cold_start_ms: float = COLD_START_MS,
        buffer_window_ms: float = BUFFER_WINDOW_MS,
        pause_reset_ms: float = PAUSE_RESET_MS,
    ):
        self._floor = confidence_floor
        self._cold_start = cold_start_ms
        self._buf_window = buffer_window_ms
        self._pause_reset_ms = pause_reset_ms
        self._timeline: deque[dict] = deque()
        self._active_speaker: str | None = None
        self._last_word_end_ms: float | None = None

    def push_asd(self, results: list[dict]) -> None:
        """results: [{track_id, prob, ts_ms}] from one TalkNet inference run."""
        if not results:
            return
        ts_ms = results[0]["ts_ms"]
        self._timeline.append(
            {"ts_ms": ts_ms, "probs": {r["track_id"]: r["prob"] for r in results}}
        )
        cutoff = ts_ms - TIMELINE_MAX_MS
        while self._timeline and self._timeline[0]["ts_ms"] < cutoff:
            self._timeline.popleft()

    def attribute(self, word: dict) -> dict:
        """
        word: {word, start_ms, end_ms}
        Returns {speaker, word, start_ms, end_ms}.
        speaker is a track_id string; server.py maps it to person_N.
        """
        if word["end_ms"] < self._cold_start:
            return {**word, "speaker": "unknown"}

        # If there was a pause, reset the active speaker turn.
        if self._last_word_end_ms is not None:
            if (word["start_ms"] - self._last_word_end_ms) > self._pause_reset_ms:
                self._active_speaker = None

        lo = word["start_ms"] - self._buf_window
        hi = word["end_ms"] + self._buf_window
        window = [e for e in self._timeline if lo <= e["ts_ms"] <= hi]

        if not window:
            speaker = self._active_speaker or "unknown"
            self._last_word_end_ms = word["end_ms"]
            return {**word, "speaker": speaker}

        totals: dict[str, float] = {}
        counts: dict[str, int] = {}
        for entry in window:
            for tid, prob in entry["probs"].items():
                totals[tid] = totals.get(tid, 0.0) + prob
                counts[tid] = counts.get(tid, 0) + 1

        avg = {tid: totals[tid] / counts[tid] for tid in totals}

        best_tid = max(avg, key=avg.get)
        best_score = avg[best_tid]

        if best_score >= self._floor:
            self._active_speaker = best_tid

        speaker = self._active_speaker or "unknown"
        self._last_word_end_ms = word["end_ms"]
        return {**word, "speaker": speaker}
