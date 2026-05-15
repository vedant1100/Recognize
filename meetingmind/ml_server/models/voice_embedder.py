"""
ECAPA-TDNN via SpeechBrain — extracts 192-dim voice embedding from an audio clip.
Input:  base64-encoded raw PCM audio (16kHz, mono, 16-bit)
Output: 192-dim float list (L2-normalized)
"""
import base64
import numpy as np
import torch
import torchaudio
from speechbrain.pretrained import EncoderClassifier

_model: EncoderClassifier | None = None
SAMPLE_RATE = 16000


def load():
    global _model
    _model = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir="pretrained_models/spkrec-ecapa-voxceleb",
        run_opts={"device": "cuda" if torch.cuda.is_available() else "cpu"},
    )


def embed(audio_b64: str) -> list[float]:
    assert _model is not None, "Call load() first"
    pcm_bytes = base64.b64decode(audio_b64)
    pcm = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    waveform = torch.tensor(pcm).unsqueeze(0)  # [1, samples]

    with torch.no_grad():
        embedding = _model.encode_batch(waveform)  # [1, 1, 192]

    vec = embedding.squeeze().cpu().numpy()
    vec = vec / (np.linalg.norm(vec) + 1e-8)  # L2 normalize
    return vec.tolist()
