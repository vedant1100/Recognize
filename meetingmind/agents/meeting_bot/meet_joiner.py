"""
Connects to a Google Meet session via the Media API (WebRTC) and returns
audio + video stream handles. Requires Google Meet Media API developer preview access.
"""
import asyncio
import httpx
from google.oauth2 import service_account
from googleapiclient.discovery import build

from config import GOOGLE_SERVICE_ACCOUNT_KEY, BUTTERBASE_API_KEY, BUTTERBASE_API_URL, BUTTERBASE_APP_ID

MEET_SCOPES = [
    "https://www.googleapis.com/auth/meetings.space.readonly",
]


def _build_meet_service():
    import json
    key = json.loads(GOOGLE_SERVICE_ACCOUNT_KEY)
    creds = service_account.Credentials.from_service_account_info(key, scopes=MEET_SCOPES)
    return build("meet", "v2", credentials=creds)


def _set_meeting_status(meeting_id: str, status: str):
    httpx.patch(
        f"{BUTTERBASE_API_URL}/meetings/{meeting_id}",
        json={"status": status},
        headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        timeout=10,
    ).raise_for_status()


async def join_meeting(meeting_id: str, meet_code: str) -> dict:
    """
    Joins the Meet session via Media API WebRTC.
    Returns {"audio_track": ..., "video_track": ...} handles for stream processing.

    NOTE: Google Meet Media API is in developer preview. The exact WebRTC negotiation
    flow depends on the API version granted. This is a placeholder for the actual
    aiortc / Media API integration.
    """
    _set_meeting_status(meeting_id, "enrolling")

    # TODO: Replace with actual Meet Media API WebRTC join flow.
    # Steps:
    #   1. POST /v2/spaces/{meet_code}/members to add bot as participant
    #   2. Negotiate SDP offer/answer with Meet SFU
    #   3. Establish RTCPeerConnection via aiortc
    #   4. Subscribe to remote audio and video tracks
    # For now, return placeholder stream handles.

    print(f"[meet_joiner] Joined meeting {meet_code} (meeting_id={meeting_id})")
    return {
        "audio_track": None,  # aiortc MediaStreamTrack
        "video_track": None,  # aiortc MediaStreamTrack
        "meeting_id": meeting_id,
        "meet_code": meet_code,
    }


async def leave_meeting(meet_code: str):
    """Gracefully disconnects the bot from the meeting."""
    # TODO: Close RTCPeerConnection and deregister from Meet SFU
    print(f"[meet_joiner] Left meeting {meet_code}")
