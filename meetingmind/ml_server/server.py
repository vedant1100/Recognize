"""
ML inference server — runs on Nosana GPU cluster.
Loads all models on startup, then serves inference requests via FastAPI.
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI

from models import face_detector, face_embedder, voice_embedder, diarizer
from api_routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[ml_server] Loading models...")
    face_detector.load()
    face_embedder.load()
    voice_embedder.load()
    diarizer.load()
    # face_tracker and lip_detector are stateless — no load() needed
    print("[ml_server] All models loaded.")
    yield
    print("[ml_server] Shutting down.")


app = FastAPI(title="MeetingMind ML Server", lifespan=lifespan)
app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), workers=1)
