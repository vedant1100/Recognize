"""
Graph agent — triggered post-meeting by mom_agent.
Feeds the full transcript to EverOS for automatic knowledge graph construction,
and also ingests transcript segments into the Butterbase RAG collection for semantic search.
"""
import asyncio
import os
import httpx
import agentfield as af

from everos_client import ingest_conversation

BUTTERBASE_API_KEY = os.environ["BUTTERBASE_API_KEY"]
BUTTERBASE_API_URL = os.environ["BUTTERBASE_API_URL"]
BUTTERBASE_APP_ID = os.environ["BUTTERBASE_APP_ID"]

app = af.App("graph-agent")
HEADERS = {"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID}


async def _fetch_segments_with_names(meeting_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{BUTTERBASE_API_URL}/transcript_segments",
            params={"meeting_id": meeting_id, "order": "start_time_ms.asc", "include": "person"},
            headers=HEADERS,
        )
        resp.raise_for_status()
        return resp.json()


async def _fetch_meeting(meeting_id: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"{BUTTERBASE_API_URL}/meetings/{meeting_id}", headers=HEADERS)
        resp.raise_for_status()
        return resp.json()


async def _ingest_into_butterbase_rag(meeting_id: str, meeting_title: str, date: str, segments: list[dict]):
    """Ingests transcript segments as documents into the Butterbase RAG collection."""
    documents = []
    for seg in segments:
        name = seg.get("person_name") or seg.get("speaker_label", "Unknown")
        documents.append({
            "content": f"{name} said: {seg['text']}",
            "metadata": {
                "meeting_id": meeting_id,
                "meeting_title": meeting_title,
                "date": date,
                "person_id": seg.get("person_id"),
                "start_time_ms": seg["start_time_ms"],
            },
        })

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{BUTTERBASE_API_URL}/rag/meeting_transcripts/ingest",
            json={"documents": documents},
            headers=HEADERS,
        )
        resp.raise_for_status()


@app.reasoner()
async def update(meeting_id: str, mom: dict):
    meeting = await _fetch_meeting(meeting_id)
    segments = await _fetch_segments_with_names(meeting_id)

    turns = [
        {
            "speaker": seg.get("person_name") or seg.get("speaker_label", "Unknown"),
            "text": seg["text"],
            "timestamp_ms": seg["start_time_ms"],
        }
        for seg in segments
    ]

    # Feed to EverOS and Butterbase RAG in parallel
    date = meeting.get("actual_start", meeting.get("scheduled_start", ""))[:10]
    await asyncio.gather(
        ingest_conversation(meeting_id, meeting.get("title", "Meeting"), date, turns),
        _ingest_into_butterbase_rag(meeting_id, meeting.get("title", "Meeting"), date, segments),
    )

    return {"meeting_id": meeting_id, "segments_ingested": len(segments)}


if __name__ == "__main__":
    app.run()
