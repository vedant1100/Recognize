"""
Simple word → speaker attribution.

When a transcribed word arrives with timestamps, look up the lip detector's
speaking timeline to find who was talking during that window.
"""

COLD_START_MS = 2000.0
BUFFER_WINDOW_MS = 300.0
PAUSE_RESET_MS = 900.0


class Diarizer:
    """Attributes transcribed words to speakers via lip-movement timeline."""

    def __init__(self, lip_detector, *, cold_start_ms: float = COLD_START_MS):
        self._lip = lip_detector
        self._cold_start = cold_start_ms
        self._active_speaker: str | None = None
        self._last_word_end_ms: float | None = None

    def attribute(self, word: dict) -> dict:
        """
        word: {word, start_ms, end_ms}
        Returns {speaker, word, start_ms, end_ms}.
        """
        if word["end_ms"] < self._cold_start:
            return {**word, "speaker": "unknown"}

        # Reset turn on long pause
        if self._last_word_end_ms is not None:
            if (word["start_ms"] - self._last_word_end_ms) > PAUSE_RESET_MS:
                self._active_speaker = None

        # Query the lip detector timeline
        speaker = self._lip.get_speaker_at(
            word["start_ms"] - BUFFER_WINDOW_MS,
            word["end_ms"] + BUFFER_WINDOW_MS,
        )

        if speaker != "unknown":
            self._active_speaker = speaker
        else:
            speaker = self._active_speaker or "unknown"

        self._last_word_end_ms = word["end_ms"]
        return {**word, "speaker": speaker}
