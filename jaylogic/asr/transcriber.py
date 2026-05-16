import json
import queue

from vosk import Model, KaldiRecognizer

SAMPLE_RATE = 16000


class VoskTranscriber:
    """
    Accepts 16kHz mono int16 PCM pushed from the WebSocket,
    writes it to audio_ring_buffer, and emits {word, start_ms, end_ms}.
    """

    def __init__(self, model_path: str, audio_ring_buffer, session_start_ms: float = 0.0):
        self._audio_buf = audio_ring_buffer
        self._word_queue: queue.Queue = queue.Queue()

        model = Model(model_path)
        self._rec = KaldiRecognizer(model, SAMPLE_RATE)
        self._rec.SetWords(True)

    def start(self) -> None:
        pass  # audio is pushed externally via push_audio()

    def stop(self) -> None:
        pass

    def push_audio(self, pcm_bytes: bytes, ts_ms: float) -> None:
        self._audio_buf.push(pcm_bytes, ts_ms)
        if self._rec.AcceptWaveform(pcm_bytes):
            result = json.loads(self._rec.Result())
            for w in result.get("result", []):
                self._word_queue.put({
                    "word": w["word"],
                    "start_ms": w["start"] * 1000,
                    "end_ms": w["end"] * 1000,
                })

    def get_word(self, timeout: float = 0.05) -> dict | None:
        try:
            return self._word_queue.get(timeout=timeout)
        except queue.Empty:
            return None
