"""
During the live meeting: resolves diarized speaker labels to enrolled person identities
by matching voice embeddings, then writes attributed transcript segments to Butterbase.
"""
import asyncio
import httpx
import numpy as np

from config import (
    NOSANA_GPU_ENDPOINT, BUTTERBASE_API_KEY, BUTTERBASE_API_URL, BUTTERBASE_APP_ID,
    VOICE_MATCH_THRESHOLD,
)


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(np.dot(va, vb) / denom) if denom > 0 else 0.0


class LiveTracker:
    """
    Maintains a mapping of diarization speaker labels (SPEAKER_00, SPEAKER_01, ...)
    to enrolled person_ids by accumulating voice samples and matching embeddings.
    """

    def __init__(self, meeting_id: str, enrolled_persons: list[dict]):
        """
        enrolled_persons: [{person_id, name, voice_embedding}] from Butterbase persons table.
        """
        self.meeting_id = meeting_id
        self.enrolled = enrolled_persons
        # speaker_label -> person dict once resolved
        self._label_to_person: dict[str, dict] = {}
        # Accumulated audio per speaker label for bootstrapped voice enrollment
        self._speaker_audio: dict[str, list[bytes]] = {}

    def _resolve_label(self, speaker_label: str, voice_embedding: list[float]) -> dict | None:
        best, best_score = None, VOICE_MATCH_THRESHOLD
        for person in self.enrolled:
            stored = person.get("voice_embedding")
            if not stored:
                continue
            score = _cosine_similarity(voice_embedding, stored)
            if score > best_score:
                best, best_score = person, score
        return best

    async def _get_voice_embedding(self, audio_b64: str) -> list[float]:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(f"{NOSANA_GPU_ENDPOINT}/embed-voice", json={"audio_b64": audio_b64})
            resp.raise_for_status()
            return resp.json()["embedding"]

    async def _write_segment(self, person_id: str | None, speaker_label: str,
                              start_ms: int, end_ms: int, text: str, confidence: float = 1.0):
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"{BUTTERBASE_API_URL}/transcript_segments",
                json={
                    "meeting_id": self.meeting_id,
                    "person_id": person_id,
                    "speaker_label": speaker_label,
                    "start_time_ms": start_ms,
                    "end_time_ms": end_ms,
                    "text": text,
                    "confidence": confidence,
                },
                headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
            )

    async def process_segment(self, segment: dict, audio_b64: str | None = None):
        """
        segment: {speaker_label, start_ms, end_ms, text}
        audio_b64: optional audio bytes for this segment (used for voice embedding if label unresolved)
        """
        label = segment["speaker_label"]

        # If already resolved, write directly
        if label in self._label_to_person:
            person = self._label_to_person[label]
            await self._write_segment(person["person_id"], label,
                                       segment["start_ms"], segment["end_ms"], segment["text"])
            return

        # Try to resolve via voice embedding
        if audio_b64 and len(self.enrolled) > 0:
            embedding = await self._get_voice_embedding(audio_b64)
            person = self._resolve_label(label, embedding)
            if person:
                self._label_to_person[label] = person
                await self._write_segment(person["person_id"], label,
                                           segment["start_ms"], segment["end_ms"], segment["text"])
                return

        # Unresolved — write with null person_id, will be resolved in post-processing
        await self._write_segment(None, label, segment["start_ms"], segment["end_ms"], segment["text"])
