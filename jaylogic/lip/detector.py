"""
Lip-movement speaker detector — MediaPipe FaceLandmarker (tasks API).

Detects faces, tracks them across frames via centroid matching,
computes Mouth Aspect Ratio (MAR) per face, and flags the face
whose mouth is moving the most as the active speaker.

No audio required.
"""

import threading
from collections import deque
from pathlib import Path

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python.vision import (
    FaceLandmarker,
    FaceLandmarkerOptions,
    RunningMode,
)
from mediapipe.tasks.python import BaseOptions

# MediaPipe Face Mesh landmark indices for mouth
_UPPER_LIP = 13    # inner upper lip center
_LOWER_LIP = 14    # inner lower lip center
_LEFT_MOUTH = 78    # left mouth corner
_RIGHT_MOUTH = 308  # right mouth corner

_MATCH_DIST = 0.8           # max normalized centroid distance for track matching
_STALE_FRAMES = 90          # drop a track after this many frames unseen
_TIMELINE_MAX_MS = 10_000   # keep 10s of speaker history

_MODEL_PATH = str(Path(__file__).resolve().parent.parent / "face_landmarker.task")


class LipSpeakerDetector:
    """
    Thread-safe.  Call process_frame() from any thread.
    Call get_speaker_at() from the word-attribution thread.
    """

    def __init__(
        self,
        max_faces: int = 6,
        mar_window: int = 12,
        mar_threshold: float = 0.0008,
    ):
        options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=_MODEL_PATH),
            running_mode=RunningMode.IMAGE,
            num_faces=max_faces,
            min_face_detection_confidence=0.2,
            min_face_presence_confidence=0.2,
            min_tracking_confidence=0.2,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self._landmarker = FaceLandmarker.create_from_options(options)
        self._mar_window = mar_window
        self._mar_threshold = mar_threshold

        self._lock = threading.Lock()

        # per-track state
        self._tracks: dict[str, deque] = {}             # track_id → MAR deque
        self._track_centroids: dict[str, tuple] = {}    # track_id → (cx, cy)
        self._track_bboxes: dict[str, list] = {}        # track_id → [x, y, w, h]
        self._track_last_seen: dict[str, int] = {}      # track_id → frame#
        self._track_age: dict[str, int] = {}            # track_id → number of frames matched
        self._next_id = 1

        # identity mapping
        self._person_map: dict[str, str] = {}       # track_id → "person_N"
        self._person_map_locked = False
        self._custom_labels: dict[str, str] = {}    # "person_N" → real name

        # speaking timeline
        self._timeline: deque = deque()
        self._frame_count = 0

    # ── public API ────────────────────────────────────────────────────────────

    def process_frame(self, frame: np.ndarray, ts_ms: float) -> dict:
        """
        Accepts one BGR frame.  Returns dict with keys:
          tracks          — list of per-face dicts
          active_speaker  — person label or None
          frame_count     — total frames processed
        """
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect(mp_image)

        self._frame_count += 1

        if not result.face_landmarks:
            self._push_timeline(ts_ms, None)
            return {"tracks": [], "active_speaker": None, "frame_count": self._frame_count}

        # ---- extract detections ----
        detections = []
        for face_lms in result.face_landmarks:
            xs = [lm.x for lm in face_lms]
            ys = [lm.y for lm in face_lms]

            bbox = [
                int(min(xs) * w), int(min(ys) * h),
                int((max(xs) - min(xs)) * w), int((max(ys) - min(ys)) * h),
            ]
            cx = (min(xs) + max(xs)) / 2
            cy = (min(ys) + max(ys)) / 2
            mar = self._compute_mar(face_lms)

            detections.append({"centroid": (cx, cy), "bbox": bbox, "mar": mar})

        # ---- match + update tracks ----
        with self._lock:
            matched = self._match_tracks(detections)
            self._gc_stale_tracks()

            # lock identities after 30 frames
            if not self._person_map_locked and self._frame_count >= 30 and matched:
                ordered = sorted(matched, key=lambda m: m[1]["centroid"][0])
                for i, (tid, _) in enumerate(ordered):
                    self._person_map[tid] = f"person_{i + 1}"
                self._person_map_locked = True

            elif self._person_map_locked:
                n = len(self._person_map)
                for tid, _ in matched:
                    if tid not in self._person_map and self._track_age.get(tid, 0) >= 15:
                        n += 1
                        self._person_map[tid] = f"person_{n}"

            # ---- determine who's speaking ----
            speaking = []
            track_results = []

            for tid, det in matched:
                is_speaking = False
                buf = self._tracks.get(tid)
                if buf and len(buf) >= 5:
                    var = float(np.var(list(buf)))
                    is_speaking = var > self._mar_threshold

                plabel = self._person_map.get(tid, "unknown")
                name = self._custom_labels.get(plabel, "")

                track_results.append({
                    "track_id": tid,
                    "speaker": plabel,
                    "name": name,
                    "bbox": det["bbox"],
                    "is_speaking": is_speaking,
                })

                if is_speaking and plabel != "unknown":
                    speaking.append((tid, np.var(list(buf))))

            active = None
            if speaking:
                best = max(speaking, key=lambda x: x[1])[0]
                active = self._person_map.get(best)

        self._push_timeline(ts_ms, active)

        return {
            "tracks": track_results,
            "active_speaker": active,
            "frame_count": self._frame_count,
        }

    def get_speaker_at(self, start_ms: float, end_ms: float) -> str:
        """Who was speaking during [start_ms, end_ms]?"""
        with self._lock:
            window = [e for e in self._timeline if start_ms <= e["ts_ms"] <= end_ms]

        if not window:
            return "unknown"

        counts: dict[str, int] = {}
        for e in window:
            s = e.get("speaker")
            if s:
                counts[s] = counts.get(s, 0) + 1

        return max(counts, key=counts.get) if counts else "unknown"

    def set_name(self, person_label: str, name: str) -> None:
        with self._lock:
            if name:
                self._custom_labels[person_label] = name
            else:
                self._custom_labels.pop(person_label, None)

    def get_custom_label(self, person_label: str) -> str:
        with self._lock:
            return self._custom_labels.get(person_label, "")

    def is_locked(self) -> bool:
        return self._person_map_locked

    def get_speakers(self) -> list[str]:
        with self._lock:
            return list(self._person_map.values())

    # ── internals ─────────────────────────────────────────────────────────────

    @staticmethod
    def _compute_mar(landmarks) -> float:
        u = landmarks[_UPPER_LIP]
        l = landmarks[_LOWER_LIP]
        lt = landmarks[_LEFT_MOUTH]
        rt = landmarks[_RIGHT_MOUTH]

        vert = ((u.x - l.x) ** 2 + (u.y - l.y) ** 2) ** 0.5
        horiz = ((lt.x - rt.x) ** 2 + (lt.y - rt.y) ** 2) ** 0.5
        return vert / (horiz + 1e-8)

    @staticmethod
    def _bbox_iou(box1: list[int], box2: list[int]) -> float:
        x1, y1, w1, h1 = box1
        x2, y2, w2, h2 = box2
        ix1 = max(x1, x2)
        iy1 = max(y1, y2)
        ix2 = min(x1 + w1, x2 + w2)
        iy2 = min(y1 + h1, y2 + h2)
        i_area = max(0, ix2 - ix1) * max(0, iy2 - iy1)
        if i_area == 0:
            return 0.0
        u_area = w1 * h1 + w2 * h2 - i_area
        return i_area / u_area if u_area > 0 else 0.0

    def _match_tracks(self, detections: list[dict]) -> list[tuple]:
        """IoU + Centroid matching.  Returns [(track_id, detection)]."""
        matched = []
        used_tids: set[str] = set()
        used_dets: set[int] = set()

        if not self._track_centroids:
            for det in detections:
                tid = f"t_{self._next_id}"
                self._next_id += 1
                self._tracks[tid] = deque(maxlen=self._mar_window)
                self._tracks[tid].append(det["mar"])
                self._track_centroids[tid] = det["centroid"]
                self._track_bboxes[tid] = det["bbox"]
                self._track_last_seen[tid] = self._frame_count
                self._track_age[tid] = 1
                matched.append((tid, det))
            return matched

        # Phase 1: IoU Matching
        iou_pairs = []
        for i, det in enumerate(detections):
            for tid, bbox in self._track_bboxes.items():
                iou = self._bbox_iou(det["bbox"], bbox)
                if iou > 0.15:
                    iou_pairs.append((iou, i, tid))
        iou_pairs.sort(reverse=True)
        
        for _, i, tid in iou_pairs:
            if i in used_dets or tid in used_tids:
                continue
            used_dets.add(i)
            used_tids.add(tid)
            self._tracks[tid].append(detections[i]["mar"])
            self._track_centroids[tid] = detections[i]["centroid"]
            self._track_bboxes[tid] = detections[i]["bbox"]
            self._track_last_seen[tid] = self._frame_count
            self._track_age[tid] = self._track_age.get(tid, 0) + 1
            matched.append((tid, detections[i]))

        # Phase 2: Fallback Centroid Matching
        pairs = []
        for i, det in enumerate(detections):
            if i in used_dets:
                continue
            for tid, c in self._track_centroids.items():
                if tid in used_tids:
                    continue
                d = ((det["centroid"][0] - c[0]) ** 2 + (det["centroid"][1] - c[1]) ** 2) ** 0.5
                if d < 0.2:
                    pairs.append((d, i, tid))
        pairs.sort()

        for _, i, tid in pairs:
            if i in used_dets or tid in used_tids:
                continue
            used_dets.add(i)
            used_tids.add(tid)
            self._tracks[tid].append(detections[i]["mar"])
            self._track_centroids[tid] = detections[i]["centroid"]
            self._track_bboxes[tid] = detections[i]["bbox"]
            self._track_last_seen[tid] = self._frame_count
            self._track_age[tid] = self._track_age.get(tid, 0) + 1
            matched.append((tid, detections[i]))

        # Phase 3: New tracks
        for i, det in enumerate(detections):
            if i in used_dets:
                continue
            tid = f"t_{self._next_id}"
            self._next_id += 1
            self._tracks[tid] = deque(maxlen=self._mar_window)
            self._tracks[tid].append(det["mar"])
            self._track_centroids[tid] = det["centroid"]
            self._track_bboxes[tid] = det["bbox"]
            self._track_last_seen[tid] = self._frame_count
            self._track_age[tid] = 1
            matched.append((tid, det))

        return matched

    def _gc_stale_tracks(self) -> None:
        """Remove tracks not seen for _STALE_FRAMES."""
        for tid in list(self._track_last_seen):
            age = self._frame_count - self._track_last_seen[tid]
            limit = _STALE_FRAMES * 3 if tid in self._person_map else _STALE_FRAMES
            if age > limit:
                self._tracks.pop(tid, None)
                self._track_centroids.pop(tid, None)
                self._track_bboxes.pop(tid, None)
                self._track_last_seen.pop(tid, None)
                self._track_age.pop(tid, None)

    def _push_timeline(self, ts_ms: float, speaker: str | None) -> None:
        with self._lock:
            self._timeline.append({"ts_ms": ts_ms, "speaker": speaker})
            cutoff = ts_ms - _TIMELINE_MAX_MS
            while self._timeline and self._timeline[0]["ts_ms"] < cutoff:
                self._timeline.popleft()
