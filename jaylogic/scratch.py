import os
from dotenv import load_dotenv
load_dotenv(".env")
from groq import Groq
import io
import wave
import numpy as np

sr = 16000
pcm = np.zeros(int(sr * 0.5), dtype=np.int16).tobytes()
buf = io.BytesIO()
with wave.open(buf, "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sr)
    wf.writeframes(pcm)
wav_bytes = buf.getvalue()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
try:
    resp = client.audio.transcriptions.create(
        file=("audio.wav", wav_bytes),
        model="whisper-large-v3-turbo",
        response_format="verbose_json",
        timestamp_granularities=["word"]
    )
    print("Type:", type(resp))
    if hasattr(resp, "model_dump"):
        print("KEYS:", resp.model_dump().keys())
    elif hasattr(resp, "__dict__"):
        print("KEYS:", resp.__dict__.keys())
except Exception as e:
    print(e)
