"""EverOS API client — sends conversation streams and queries memories."""
import os
import httpx

EVERMIND_API_KEY = os.environ["EVERMIND_API_KEY"]
EVERMIND_API_URL = os.environ.get("EVERMIND_API_URL", "https://everos.evermind.ai")

HEADERS = {"Authorization": f"Bearer {EVERMIND_API_KEY}", "Content-Type": "application/json"}


async def ingest_conversation(meeting_id: str, meeting_title: str, date: str,
                               turns: list[dict]) -> dict:
    """
    Sends a speaker-attributed conversation to EverOS for automatic MemCell extraction.
    turns: [{speaker: "Sarah Chen", text: "...", timestamp_ms: 0}]
    Returns the EverOS ingestion response.
    """
    payload = {
        "conversation_id": meeting_id,
        "title": meeting_title,
        "date": date,
        "turns": turns,
        "metadata": {"source": "meetingmind", "meeting_id": meeting_id},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(f"{EVERMIND_API_URL}/v1/conversations", json=payload, headers=HEADERS)
        resp.raise_for_status()
        return resp.json()


async def query_memories(question: str, org_id: str, top_k: int = 10) -> list[dict]:
    """
    Reconstructive recollection — returns relevant MemCells for an executive query.
    Each MemCell has: {content, source_meeting_id, speaker, timestamp, confidence}
    """
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{EVERMIND_API_URL}/v1/recollect",
            json={"query": question, "scope": org_id, "top_k": top_k},
            headers=HEADERS,
        )
        resp.raise_for_status()
        return resp.json()["memories"]


async def get_person_profile(person_id: str) -> dict:
    """Returns the evolving EverOS profile for a person (topics, patterns, decision history)."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{EVERMIND_API_URL}/v1/profiles/{person_id}",
            headers=HEADERS,
        )
        resp.raise_for_status()
        return resp.json()
