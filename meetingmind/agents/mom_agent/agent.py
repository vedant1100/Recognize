"""
MOM agent — triggered post-meeting by the meeting_bot_agent.
Fetches transcript from Butterbase, calls Claude, writes MOM back,
then in parallel triggers kpi_agent and graph_agent.
"""
import asyncio
import json
import os
import httpx
import agentfield as af
from anthropic import AsyncAnthropic

from prompts import SYSTEM_PROMPT, build_mom_prompt
from email_sender import send_mom_email

BUTTERBASE_API_KEY = os.environ["BUTTERBASE_API_KEY"]
BUTTERBASE_API_URL = os.environ["BUTTERBASE_API_URL"]
BUTTERBASE_APP_ID = os.environ["BUTTERBASE_APP_ID"]

llm = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

app = af.App("mom-agent")


async def _fetch_transcript(meeting_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{BUTTERBASE_API_URL}/transcript_segments",
            params={"meeting_id": meeting_id, "order": "start_time_ms.asc"},
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )
        resp.raise_for_status()
        return resp.json()


async def _fetch_meeting(meeting_id: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{BUTTERBASE_API_URL}/meetings/{meeting_id}",
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )
        resp.raise_for_status()
        return resp.json()


def _format_transcript(segments: list[dict]) -> str:
    lines = []
    for seg in segments:
        name = seg.get("person_name") or seg.get("speaker_label", "Unknown")
        ts = seg["start_time_ms"] // 1000
        h, m, s = ts // 3600, (ts % 3600) // 60, ts % 60
        lines.append(f"[{h:02d}:{m:02d}:{s:02d}] {name}: {seg['text']}")
    return "\n".join(lines)


async def _generate_mom(transcript_text: str) -> dict:
    response = await llm.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},  # cache the static system prompt
            }
        ],
        messages=[{"role": "user", "content": build_mom_prompt(transcript_text)}],
    )
    return json.loads(response.content[0].text)


async def _write_mom(meeting_id: str, mom: dict) -> str:
    """Writes MOM + action_items + decisions to Butterbase. Returns mom_id."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{BUTTERBASE_API_URL}/moms",
            json={
                "meeting_id": meeting_id,
                "summary": mom["executive_summary"],
                "structured_mom": mom,
            },
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )
        resp.raise_for_status()
        mom_id = resp.json()["id"]

    # Write action items
    async with httpx.AsyncClient(timeout=15) as client:
        for item in mom.get("action_items", []):
            await client.post(
                f"{BUTTERBASE_API_URL}/action_items",
                json={
                    "mom_id": mom_id,
                    "meeting_id": meeting_id,
                    "description": item["description"],
                    "deadline": item.get("deadline"),
                },
                headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
            )

    return mom_id


@app.reasoner()
async def generate(meeting_id: str):
    meeting = await _fetch_meeting(meeting_id)
    segments = await _fetch_transcript(meeting_id)
    transcript_text = _format_transcript(segments)

    mom = await _generate_mom(transcript_text)
    mom_id = await _write_mom(meeting_id, mom)

    # Trigger downstream agents in parallel
    await asyncio.gather(
        app.call("kpi-agent.extract", {"meeting_id": meeting_id}),
        app.call("graph-agent.update", {"meeting_id": meeting_id, "mom": mom}),
    )

    # Send MOM email
    stakeholder_emails = meeting.get("settings", {}).get("stakeholder_emails", [])
    if stakeholder_emails:
        await send_mom_email(stakeholder_emails, mom, meeting.get("title", "Meeting"))

    # Mark meeting completed
    async with httpx.AsyncClient(timeout=10) as client:
        await client.patch(
            f"{BUTTERBASE_API_URL}/meetings/{meeting_id}",
            json={"status": "completed"},
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )

    return {"mom_id": mom_id, "meeting_id": meeting_id}


if __name__ == "__main__":
    app.run()
