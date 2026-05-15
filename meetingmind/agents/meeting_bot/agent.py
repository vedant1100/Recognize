"""
MeetingMind meeting bot agent — the core long-running AgentField agent.
Watches Google Calendar, auto-joins Meet sessions, runs enrollment + live processing,
triggers the post-meeting pipeline when the meeting ends.
"""
import asyncio
import agentfield as af

from calendar_watcher import run_watcher
from meet_joiner import join_meeting, leave_meeting
from audio_capture import process_audio_stream
from video_capture import process_video_stream
from enrollment_orchestrator import run_enrollment
from live_tracker import LiveTracker
import httpx
from config import BUTTERBASE_API_KEY, BUTTERBASE_API_URL, BUTTERBASE_APP_ID

app = af.App("meeting-bot")


async def _get_enrolled_persons(org_id: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{BUTTERBASE_API_URL}/persons",
            params={"org_id": org_id, "voice_enrolled": True},
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )
        resp.raise_for_status()
        return resp.json()


async def _set_meeting_end(meeting_id: str):
    async with httpx.AsyncClient(timeout=10) as client:
        await client.patch(
            f"{BUTTERBASE_API_URL}/meetings/{meeting_id}",
            json={"status": "processing"},
            headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        )


async def _run_meeting(meeting_info: dict, org_id: str):
    meeting_id = meeting_info["meeting_id"]
    meet_code = meeting_info["meet_code"]

    # Join the meeting
    streams = await join_meeting(meeting_id, meet_code)
    audio_track = streams["audio_track"]
    video_track = streams["video_track"]

    # Enrollment phase — get initial frames and let host label faces
    # In production: wait for first frame batch from video_capture before calling enrollment
    identity_map: dict[str, dict] = {}  # track_id -> {person_id, name}
    # enrollment_orchestrator.run_enrollment() fills identity_map via the Add-on UI

    # Enrolled persons for voice matching
    enrolled_persons = await _get_enrolled_persons(org_id)
    tracker = LiveTracker(meeting_id, enrolled_persons)

    async def on_audio_segment(segment: dict):
        await tracker.process_segment(segment)

    # Run audio and video pipelines concurrently until meeting ends
    try:
        await asyncio.gather(
            process_audio_stream(audio_track, on_audio_segment),
            process_video_stream(video_track, meeting_id, identity_map),
        )
    except asyncio.CancelledError:
        pass

    await leave_meeting(meet_code)
    await _set_meeting_end(meeting_id)

    # Trigger post-meeting pipeline via AgentField
    await app.call("mom-agent.generate", {"meeting_id": meeting_id})


@app.reasoner()
async def main():
    """Long-running agent: watches calendar and spawns a meeting handler per session."""
    org_id = "REPLACE_WITH_ORG_ID"  # TODO: derive from service account / env

    loop = asyncio.get_event_loop()
    pending_meetings: asyncio.Queue = asyncio.Queue()

    def on_meeting_found(meeting_info: dict):
        loop.call_soon_threadsafe(pending_meetings.put_nowait, meeting_info)

    # Calendar watcher runs in a thread (blocking poll loop)
    import concurrent.futures
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    loop.run_in_executor(executor, run_watcher, on_meeting_found)

    # Process meetings as they arrive
    while True:
        meeting_info = await pending_meetings.get()
        asyncio.create_task(_run_meeting(meeting_info, org_id))


if __name__ == "__main__":
    app.run(main)
