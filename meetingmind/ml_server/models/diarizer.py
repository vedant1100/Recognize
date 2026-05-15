"""
pyannote-audio 3.x — speaker diarization on single-channel audio.
Input:  base64-encoded raw PCM audio (16kHz, mono, 16-bit) + sample_rate
Output: list of {speaker, start_ms, end_ms}
"""
import base64
import os
import numpy as np
import torch
import torchaudio
from io import BytesIO
from pyannote.audio import Pipeline

HUGGINGFACE_TOKEN = os.environ.get("HUGGINGFACE_TOKEN", "")

_pipeline: Pipeline | None = None


def load():
    global _pipeline
    _pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=HUGGINGFACE_TOKEN,
    )
    if torch.cuda.is_available():
        _pipeline = _pipeline.to(torch.device("cuda"))


def diarize(audio_b64: str, sample_rate: int = 16000) -> list[dict]:
    assert _pipeline is not None, "Call load() first"
    pcm_bytes = base64.b64decode(audio_b64)
    pcm = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    waveform = torch.tensor(pcm).unsqueeze(0)  # [1, samples]

    audio_dict = {"waveform": waveform, "sample_rate": sample_rate}
    diarization = _pipeline(audio_dict)

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append({
            "speaker": speaker,
            "start_ms": int(turn.start * 1000),
            "end_ms": int(turn.end * 1000),
        })
    return segments
