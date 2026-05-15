"""
Samples video frames from the Meet stream at 2 fps, runs face detection + tracking
+ lip activity detection via Nosana GPU, pushes overlay data to Butterbase realtime.
"""
import asyncio
import base64
import httpx
import time

from config import NOSANA_GPU_ENDPOINT, BUTTERBASE_API_KEY, BUTTERBASE_API_URL, BUTTERBASE_APP_ID, FRAME_SAMPLE_RATE_FPS


async def _detect_faces(frame_b64: str) -> list[dict]:
    """Returns [{bbox: {x,y,w,h}, confidence}]."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{NOSANA_GPU_ENDPOINT}/detect-faces", json={"frame_b64": frame_b64})
        resp.raise_for_status()
        return resp.json()["detections"]


async def _track_faces(detections: list[dict], prev_tracks: list[dict]) -> list[dict]:
    """Returns detections with stable tracking IDs via ByteTrack on Nosana."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{NOSANA_GPU_ENDPOINT}/track-faces",
            json={"detections": detections, "previous_tracks": prev_tracks},
        )
        resp.raise_for_status()
        return resp.json()["tracks"]  # [{track_id, bbox, confidence}]


async def _detect_lip_activity(face_crops_b64: list[str]) -> list[dict]:
    """Returns [{track_id, is_speaking, confidence}]."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{NOSANA_GPU_ENDPOINT}/detect-lip-activity", json={"face_crops_b64": face_crops_b64})
        resp.raise_for_status()
        return resp.json()["results"]


async def _push_overlay(meeting_id: str, overlay_data: list[dict]):
    """Pushes {person_id, name, bbox, is_speaking} list to Butterbase realtime channel."""
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(
            f"{BUTTERBASE_API_URL}/realtime/active_speaker",
            json={"meeting_id": meeting_id, "overlay": overlay_data},
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )


async def process_video_stream(video_track, meeting_id: str, identity_map: dict):
    """
    identity_map: {track_id -> {person_id, name}} — updated by enrollment_orchestrator.
    Runs at FRAME_SAMPLE_RATE_FPS, pushes overlay data to Butterbase realtime.
    """
    interval = 1.0 / FRAME_SAMPLE_RATE_FPS
    prev_tracks: list[dict] = []

    # TODO: Replace with actual aiortc frame reading loop:
    # async for frame in video_track:
    #     frame_b64 = base64.b64encode(frame.to_image().tobytes()).decode()
    #     ...
    #     await asyncio.sleep(interval)

    while True:
        frame_b64 = ""  # placeholder — replace with actual frame bytes

        detections = await _detect_faces(frame_b64)
        tracks = await _track_faces(detections, prev_tracks)
        prev_tracks = tracks

        face_crops_b64 = []  # TODO: crop each face from frame using bbox
        lip_results = await _detect_lip_activity(face_crops_b64)
        lip_map = {r["track_id"]: r for r in lip_results}

        overlay = []
        for track in tracks:
            tid = track["track_id"]
            person = identity_map.get(tid, {})
            overlay.append({
                "track_id": tid,
                "person_id": person.get("person_id"),
                "name": person.get("name", f"Person {tid}"),
                "bbox": track["bbox"],
                "is_speaking": lip_map.get(tid, {}).get("is_speaking", False),
            })

        await _push_overlay(meeting_id, overlay)
        await asyncio.sleep(interval)
