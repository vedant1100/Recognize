"""FastAPI route definitions for the ML inference server."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models import face_detector, face_tracker, face_embedder, voice_embedder, diarizer, lip_detector

router = APIRouter()


# ── Request/response schemas ─────────────────────────────────────────────────

class FrameRequest(BaseModel):
    frame_b64: str

class TrackRequest(BaseModel):
    detections: list[dict]
    previous_tracks: list[dict] = []

class FaceCropRequest(BaseModel):
    face_crop_b64: str

class VoiceRequest(BaseModel):
    audio_b64: str
    sample_rate: int = 16000

class LipRequest(BaseModel):
    face_crops_b64: list[str]  # consecutive crops for one tracked face


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/detect-faces")
async def detect_faces(req: FrameRequest):
    try:
        detections = face_detector.detect(req.frame_b64)
        return {"detections": detections}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/track-faces")
async def track_faces(req: TrackRequest):
    try:
        tracks = face_tracker.update(req.detections)
        return {"tracks": tracks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/embed-face")
async def embed_face(req: FaceCropRequest):
    try:
        embedding = face_embedder.embed(req.face_crop_b64)
        return {"embedding": embedding}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/embed-voice")
async def embed_voice(req: VoiceRequest):
    try:
        embedding = voice_embedder.embed(req.audio_b64)
        return {"embedding": embedding}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/diarize")
async def diarize(req: VoiceRequest):
    try:
        segments = diarizer.diarize(req.audio_b64, req.sample_rate)
        return {"segments": segments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect-lip-activity")
async def detect_lip_activity(req: LipRequest):
    try:
        result = lip_detector.detect(req.face_crops_b64)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
