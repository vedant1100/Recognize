"""Parallel retrieval from EverOS memories + Butterbase RAG for executive Q&A."""
import asyncio
import os
import httpx
import sys
sys.path.insert(0, "../graph_agent")
from everos_client import query_memories

BUTTERBASE_API_KEY = os.environ["BUTTERBASE_API_KEY"]
BUTTERBASE_API_URL = os.environ["BUTTERBASE_API_URL"]
BUTTERBASE_APP_ID = os.environ["BUTTERBASE_APP_ID"]

HEADERS = {"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID}


async def _rag_search(question: str, org_id: str, top_k: int = 10) -> list[dict]:
    """Semantic search in Butterbase RAG collection over all transcript segments."""
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            f"{BUTTERBASE_API_URL}/rag/meeting_transcripts/search",
            json={"query": question, "top_k": top_k, "filter": {"org_id": org_id}},
            headers=HEADERS,
        )
        resp.raise_for_status()
        return resp.json()["results"]  # [{content, metadata, score}]


async def retrieve(question: str, org_id: str) -> dict:
    """
    Runs EverOS recollection and Butterbase RAG search in parallel.
    Returns {"everos_memories": [...], "rag_results": [...]}
    """
    everos_results, rag_results = await asyncio.gather(
        query_memories(question, org_id),
        _rag_search(question, org_id),
    )
    return {"everos_memories": everos_results, "rag_results": rag_results}
