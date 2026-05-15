"""
Polls Google Calendar for upcoming Meet events and creates meeting records in Butterbase.
"""
import time
import httpx
from datetime import datetime, timezone, timedelta
from google.oauth2 import service_account
from googleapiclient.discovery import build

from config import (
    GOOGLE_SERVICE_ACCOUNT_KEY,
    BUTTERBASE_API_KEY, BUTTERBASE_API_URL, BUTTERBASE_APP_ID,
    CALENDAR_POLL_INTERVAL_SECONDS, MEETING_JOIN_LEAD_SECONDS,
)


SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


def _build_calendar_service():
    import json
    key = json.loads(GOOGLE_SERVICE_ACCOUNT_KEY)
    creds = service_account.Credentials.from_service_account_info(key, scopes=SCOPES)
    return build("calendar", "v3", credentials=creds)


def _extract_meet_code(event: dict) -> str | None:
    uri = event.get("conferenceData", {}).get("entryPoints", [{}])[0].get("uri", "")
    if "meet.google.com/" in uri:
        return uri.split("meet.google.com/")[-1].split("?")[0]
    return None


def _create_meeting_in_butterbase(event: dict, meet_code: str) -> str:
    """Creates a meeting record and returns the new meeting_id."""
    payload = {
        "title": event.get("summary", "Untitled Meeting"),
        "google_meet_code": meet_code,
        "google_calendar_event_id": event["id"],
        "scheduled_start": event["start"].get("dateTime"),
        "status": "waiting",
    }
    resp = httpx.post(
        f"{BUTTERBASE_API_URL}/meetings",
        json=payload,
        headers={"Authorization": f"Bearer {BUTTERBASE_API_KEY}", "X-App-ID": BUTTERBASE_APP_ID},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["id"]


def poll_once(service, seen_event_ids: set) -> list[dict]:
    """Returns list of {meeting_id, meet_code, event} dicts for meetings to join."""
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(seconds=MEETING_JOIN_LEAD_SECONDS + 30)

    events_result = service.events().list(
        calendarId="primary",
        timeMin=now.isoformat(),
        timeMax=window_end.isoformat(),
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    to_join = []
    for event in events_result.get("items", []):
        if event["id"] in seen_event_ids:
            continue
        meet_code = _extract_meet_code(event)
        if not meet_code:
            continue
        seen_event_ids.add(event["id"])
        meeting_id = _create_meeting_in_butterbase(event, meet_code)
        to_join.append({"meeting_id": meeting_id, "meet_code": meet_code, "event": event})

    return to_join


def run_watcher(on_meeting_found):
    """Blocking loop. Calls on_meeting_found({meeting_id, meet_code}) for each new meeting."""
    service = _build_calendar_service()
    seen: set[str] = set()
    while True:
        for meeting_info in poll_once(service, seen):
            on_meeting_found(meeting_info)
        time.sleep(CALENDAR_POLL_INTERVAL_SECONDS)
