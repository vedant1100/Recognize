"""
Pure KPI computation functions — no LLM needed except for sentiment and key_topics.
All inputs are transcript_segments from Butterbase.
"""
import re
from collections import defaultdict


def compute_talk_times(segments: list[dict]) -> dict[str, int]:
    """Returns {person_id: total_talk_seconds}."""
    totals: dict[str, int] = defaultdict(int)
    for seg in segments:
        pid = seg.get("person_id")
        if pid:
            totals[pid] += (seg["end_time_ms"] - seg["start_time_ms"]) // 1000
    return dict(totals)


def compute_talk_ratios(talk_times: dict[str, int]) -> dict[str, float]:
    total = sum(talk_times.values())
    if total == 0:
        return {pid: 0.0 for pid in talk_times}
    return {pid: round(t / total, 4) for pid, t in talk_times.items()}


def compute_interruptions(segments: list[dict], gap_ms: int = 500) -> dict[str, int]:
    """
    Counts how many times each person started speaking within gap_ms of the previous speaker ending.
    Only counts when the previous speaker was different.
    """
    counts: dict[str, int] = defaultdict(int)
    sorted_segs = sorted(segments, key=lambda s: s["start_time_ms"])
    for i in range(1, len(sorted_segs)):
        prev, curr = sorted_segs[i - 1], sorted_segs[i]
        if (
            curr.get("person_id")
            and prev.get("person_id")
            and curr["person_id"] != prev["person_id"]
            and (curr["start_time_ms"] - prev["end_time_ms"]) <= gap_ms
        ):
            counts[curr["person_id"]] += 1
    return dict(counts)


def compute_questions(segments: list[dict]) -> dict[str, int]:
    """Counts segments ending with '?' per person as a proxy for questions asked."""
    counts: dict[str, int] = defaultdict(int)
    for seg in segments:
        pid = seg.get("person_id")
        if pid and seg["text"].strip().endswith("?"):
            counts[pid] += 1
    return dict(counts)


def compute_statements(segments: list[dict], questions: dict[str, int]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for seg in segments:
        pid = seg.get("person_id")
        if pid:
            counts[pid] += 1
    return {pid: counts.get(pid, 0) - questions.get(pid, 0) for pid in counts}


def compute_engagement_score(
    talk_ratio: float,
    questions: int,
    total_segments: int,
    avg_response_gap_ms: float,
    max_response_gap_ms: float = 10000,
) -> float:
    """
    engagement = 0.4 * normalized_talk_ratio + 0.3 * question_frequency + 0.3 * response_speed
    All components normalized to [0, 1].
    """
    normalized_talk = min(talk_ratio * 5, 1.0)  # 20% talk ratio = max score
    question_freq = min(questions / max(total_segments, 1) * 5, 1.0)
    response_speed = 1.0 - min(avg_response_gap_ms / max_response_gap_ms, 1.0)
    return round(0.4 * normalized_talk + 0.3 * question_freq + 0.3 * response_speed, 4)
