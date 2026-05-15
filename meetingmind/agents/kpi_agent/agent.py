"""
KPI agent — triggered post-meeting by mom_agent.
Computes per-person KPIs from transcript_segments and writes to participant_kpis table.
"""
import asyncio
import os
import json
import httpx
import agentfield as af
from anthropic import AsyncAnthropic
from collections import defaultdict

from metrics import (
    compute_talk_times, compute_talk_ratios, compute_interruptions,
    compute_questions, compute_statements, compute_engagement_score,
)

BUTTERBASE_API_KEY = os.environ["BUTTERBASE_API_KEY"]
BUTTERBASE_API_URL = os.environ["BUTTERBASE_API_URL"]
BUTTERBASE_APP_ID = os.environ["BUTTERBASE_APP_ID"]

llm = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

app = af.App("kpi-agent")
HEADERS = {"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID}


async def _fetch_segments(meeting_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{BUTTERBASE_API_URL}/transcript_segments",
            params={"meeting_id": meeting_id},
            headers=HEADERS,
        )
        resp.raise_for_status()
        return resp.json()


async def _fetch_action_items_count(meeting_id: str) -> dict[str, int]:
    """Returns {person_id: count} of action items assigned in this meeting."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{BUTTERBASE_API_URL}/action_items",
            params={"meeting_id": meeting_id},
            headers=HEADERS,
        )
        resp.raise_for_status()
        counts: dict[str, int] = defaultdict(int)
        for item in resp.json():
            pid = item.get("assigned_to_person_id")
            if pid:
                counts[pid] += 1
        return dict(counts)


async def _sentiment_for_segments(person_segments: list[dict]) -> float:
    """Calls Claude Haiku (cheapest) to get sentiment score for a person's segments."""
    if not person_segments:
        return 0.0
    combined = " ".join(s["text"] for s in person_segments[:20])
    response = await llm.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=16,
        messages=[{
            "role": "user",
            "content": (
                f"Rate the overall sentiment of these statements from -1.0 (very negative) "
                f"to 1.0 (very positive). Reply with only a number.\n\n{combined}"
            ),
        }],
    )
    try:
        return float(response.content[0].text.strip())
    except ValueError:
        return 0.0


async def _key_topics(person_segments: list[dict]) -> list[str]:
    """Extracts top 3-5 topics discussed by this person."""
    if not person_segments:
        return []
    combined = " ".join(s["text"] for s in person_segments[:30])
    response = await llm.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        messages=[{
            "role": "user",
            "content": (
                f"List the top 3-5 key topics discussed in these statements. "
                f'Reply with only a JSON object: {{"topics": ["topic1", "topic2"]}}.\n\n{combined}'
            ),
        }],
    )
    try:
        data = json.loads(response.content[0].text)
        return data.get("topics", [])
    except (ValueError, KeyError):
        return []


@app.skill()
async def extract(meeting_id: str):
    segments = await _fetch_segments(meeting_id)
    action_item_counts = await _fetch_action_items_count(meeting_id)

    person_segments: dict[str, list[dict]] = defaultdict(list)
    for seg in segments:
        if seg.get("person_id"):
            person_segments[seg["person_id"]].append(seg)

    talk_times = compute_talk_times(segments)
    talk_ratios = compute_talk_ratios(talk_times)
    interruptions = compute_interruptions(segments)
    questions = compute_questions(segments)
    statements = compute_statements(segments, questions)

    async def build_kpi(person_id: str) -> dict:
        segs = person_segments[person_id]
        sentiment = await _sentiment_for_segments(segs)
        topics = await _key_topics(segs)
        engagement = compute_engagement_score(
            talk_ratio=talk_ratios.get(person_id, 0.0),
            questions=questions.get(person_id, 0),
            total_segments=len(segs),
            avg_response_gap_ms=500,  # TODO: compute actual response gaps
        )
        return {
            "meeting_id": meeting_id,
            "person_id": person_id,
            "talk_time_seconds": talk_times.get(person_id, 0),
            "talk_ratio": talk_ratios.get(person_id, 0.0),
            "interruption_count": interruptions.get(person_id, 0),
            "questions_asked": questions.get(person_id, 0),
            "statements_made": statements.get(person_id, 0),
            "action_items_assigned": action_item_counts.get(person_id, 0),
            "sentiment_score": sentiment,
            "engagement_score": engagement,
            "key_topics": topics,
        }

    kpis = await asyncio.gather(*[build_kpi(pid) for pid in person_segments])

    async with httpx.AsyncClient(timeout=15) as client:
        for kpi in kpis:
            await client.post(
                f"{BUTTERBASE_API_URL}/participant_kpis",
                json=kpi,
                headers=HEADERS,
            )

    return {"meeting_id": meeting_id, "participants_processed": len(kpis)}


if __name__ == "__main__":
    app.run()
