"""
ByteTrack — assigns stable tracking IDs to face bounding boxes across frames.
Input:  current detections [{bbox, confidence}] + previous tracks
Output: tracks [{track_id, bbox, confidence}]
"""
from dataclasses import dataclass, field
from typing import Optional
import numpy as np


@dataclass
class Track:
    track_id: int
    bbox: dict
    age: int = 0
    hits: int = 1
    confidence: float = 1.0


_next_id = 1
_active_tracks: list[Track] = []
MAX_AGE = 10  # frames before a track is dropped


def _iou(a: dict, b: dict) -> float:
    ax1, ay1 = a["x"], a["y"]
    ax2, ay2 = ax1 + a["w"], ay1 + a["h"]
    bx1, by1 = b["x"], b["y"]
    bx2, by2 = bx1 + b["w"], by1 + b["h"]

    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


def update(detections: list[dict]) -> list[dict]:
    """
    Simple IoU-based greedy matching (ByteTrack-lite).
    detections: [{bbox: {x,y,w,h}, confidence}]
    Returns: [{track_id, bbox, confidence}]
    """
    global _next_id, _active_tracks

    matched_track_ids = set()
    matched_det_indices = set()
    results = []

    # Match detections to existing tracks by IoU
    for track in _active_tracks:
        best_iou, best_idx = 0.3, -1  # IoU threshold for match
        for i, det in enumerate(detections):
            if i in matched_det_indices:
                continue
            iou = _iou(track.bbox, det["bbox"])
            if iou > best_iou:
                best_iou, best_idx = iou, i

        if best_idx >= 0:
            det = detections[best_idx]
            track.bbox = det["bbox"]
            track.confidence = det["confidence"]
            track.hits += 1
            track.age = 0
            matched_track_ids.add(track.track_id)
            matched_det_indices.add(best_idx)
            results.append({"track_id": track.track_id, "bbox": track.bbox, "confidence": track.confidence})
        else:
            track.age += 1

    # New detections → new tracks
    for i, det in enumerate(detections):
        if i not in matched_det_indices:
            new_track = Track(track_id=_next_id, bbox=det["bbox"], confidence=det["confidence"])
            _next_id += 1
            _active_tracks.append(new_track)
            results.append({"track_id": new_track.track_id, "bbox": new_track.bbox, "confidence": new_track.confidence})

    # Remove stale tracks
    _active_tracks = [t for t in _active_tracks if t.age <= MAX_AGE]

    return results


def reset():
    global _next_id, _active_tracks
    _next_id = 1
    _active_tracks = []
