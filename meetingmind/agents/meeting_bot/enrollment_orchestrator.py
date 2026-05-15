"""
Orchestrates the 60-second enrollment phase:
  1. Detect + track faces in first frames
  2. Try to match each face against the Butterbase persons table
  3. Push face thumbnails + match suggestions to the Meet Add-on via Butterbase realtime
  4. Host enters names via the Add-on UI → save face + voice embeddings to Butterbase
"""
import asyncio
import base64
import httpx
import numpy as np

from config import (
    NOSANA_GPU_ENDPOINT, BUTTERBASE_API_KEY, BUTTERBASE_API_URL, BUTTERBASE_APP_ID,
    FACE_MATCH_THRESHOLD,
)


async def _embed_face(face_crop_b64: str) -> list[float]:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{NOSANA_GPU_ENDPOINT}/embed-face", json={"face_crop_b64": face_crop_b64})
        resp.raise_for_status()
        return resp.json()["embedding"]  # 512-dim


async def _embed_voice(audio_b64: str) -> list[float]:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{NOSANA_GPU_ENDPOINT}/embed-voice", json={"audio_b64": audio_b64})
        resp.raise_for_status()
        return resp.json()["embedding"]  # 192-dim ECAPA-TDNN


async def _get_all_persons(org_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{BUTTERBASE_API_URL}/persons",
            params={"org_id": org_id},
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )
        resp.raise_for_status()
        return resp.json()


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom > 0 else 0.0


def _find_best_match(embedding: list[float], persons: list[dict]) -> dict | None:
    """Returns the best-matching person above FACE_MATCH_THRESHOLD, or None."""
    best, best_score = None, FACE_MATCH_THRESHOLD
    for person in persons:
        stored = person.get("face_embedding")
        if not stored:
            continue
        score = _cosine_similarity(embedding, stored)
        if score > best_score:
            best, best_score = person, score
    return best


async def _push_enrollment_status(meeting_id: str, faces: list[dict]):
    """Pushes face thumbnails + name suggestions to Meet Add-on via Butterbase realtime."""
    async with httpx.AsyncClient(timeout=10) as client:
        await client.post(
            f"{BUTTERBASE_API_URL}/realtime/enrollment_status",
            json={"meeting_id": meeting_id, "faces": faces},
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )


async def _save_person(org_id: str, name: str, face_embedding: list[float], face_crop_b64: str) -> dict:
    """Creates or updates a person record in Butterbase with their face embedding."""
    # Upload face crop to Butterbase storage first
    async with httpx.AsyncClient(timeout=20) as client:
        storage_resp = await client.post(
            f"{BUTTERBASE_API_URL}/storage/upload",
            content=base64.b64decode(face_crop_b64),
            headers={
                "Authorization": f"Bearer {BUTTERBASE_API_KEY}",
                "X-App-ID": BUTTERBASE_APP_ID,
                "Content-Type": "image/jpeg",
            },
        )
        storage_resp.raise_for_status()
        face_crop_url = storage_resp.json()["url"]

        person_resp = await client.post(
            f"{BUTTERBASE_API_URL}/persons",
            json={
                "org_id": org_id,
                "name": name,
                "face_embedding": face_embedding,
                "face_crop_url": face_crop_url,
                "face_enrolled": True,
            },
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )
        person_resp.raise_for_status()
        return person_resp.json()


async def _save_voice_embedding(person_id: str, voice_embedding: list[float]):
    async with httpx.AsyncClient(timeout=10) as client:
        await client.patch(
            f"{BUTTERBASE_API_URL}/persons/{person_id}",
            json={"voice_embedding": voice_embedding, "voice_enrolled": True},
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )


async def run_enrollment(meeting_id: str, org_id: str, initial_tracks: list[dict]) -> dict:
    """
    initial_tracks: [{track_id, face_crop_b64}]
    Returns identity_map: {track_id -> {person_id, name}}
    Host fills names via the Add-on; this function waits for confirmation via Butterbase realtime.
    """
    persons = await _get_all_persons(org_id)
    identity_map: dict[str, dict] = {}

    faces_to_push = []
    track_embeddings: dict[str, list[float]] = {}

    for track in initial_tracks:
        tid = track["track_id"]
        crop_b64 = track["face_crop_b64"]
        embedding = await _embed_face(crop_b64)
        track_embeddings[tid] = embedding

        match = _find_best_match(embedding, persons)
        faces_to_push.append({
            "track_id": tid,
            "face_crop_b64": crop_b64,
            "suggested_name": match["name"] if match else None,
            "suggested_person_id": match["id"] if match else None,
        })

    await _push_enrollment_status(meeting_id, faces_to_push)

    # Wait for host to confirm names via the Add-on (polled from Butterbase)
    # In production: Butterbase realtime webhook fires when host submits the form
    # Placeholder: return empty map for now
    print(f"[enrollment] Pushed {len(faces_to_push)} faces for host to label in meeting {meeting_id}")
    return identity_map


async def handle_name_submission(track_id: str, person_id: str | None, name: str,
                                  org_id: str, face_crop_b64: str,
                                  track_embeddings: dict, identity_map: dict):
    """
    Called when the host submits a name for a face in the Add-on.
    Creates or links a person record, stores the face embedding.
    """
    embedding = track_embeddings[track_id]

    if person_id:
        # Already known person — just update identity map
        identity_map[track_id] = {"person_id": person_id, "name": name}
    else:
        # New person — create record
        person = await _save_person(org_id, name, embedding, face_crop_b64)
        person_id = person["id"]
        identity_map[track_id] = {"person_id": person_id, "name": name}

    print(f"[enrollment] Enrolled {name} (person_id={person_id}, track_id={track_id})")
