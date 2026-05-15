SYSTEM_PROMPT = """You are a professional meeting secretary. Given a speaker-attributed transcript \
where each line has a person's name, timestamp, and what they said, generate a structured \
Minutes of Meeting. Attribute every point to the person who said it. Extract all action items \
with clear owners. If a deadline is not stated, mark it as TBD. Be precise and concise."""

MOM_OUTPUT_SCHEMA = {
    "title": "string — meeting title inferred from discussion",
    "date": "ISO date string",
    "duration_minutes": "integer",
    "attendees": [{"name": "string", "role": "string if known"}],
    "executive_summary": "3-5 sentences capturing key outcomes",
    "agenda_items": [{
        "topic": "string",
        "summary": "2-3 sentences",
        "key_points": ["string"],
        "raised_by": "person name",
    }],
    "decisions": [{
        "description": "string",
        "decided_by": ["person names"],
        "context": "brief context",
    }],
    "action_items": [{
        "description": "string",
        "assigned_to": "person name",
        "deadline": "date or TBD",
        "priority": "high | medium | low",
    }],
    "follow_ups": [{"topic": "string", "suggested_date": "string or null"}],
}


def build_mom_prompt(transcript_text: str) -> str:
    import json
    return (
        f"Generate a structured MOM as JSON matching this schema:\n"
        f"{json.dumps(MOM_OUTPUT_SCHEMA, indent=2)}\n\n"
        f"Transcript:\n{transcript_text}"
    )
