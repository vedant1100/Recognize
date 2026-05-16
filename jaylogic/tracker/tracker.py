import numpy as np
import cv2
from insightface.app import FaceAnalysis
from boxmot.trackers.botsort.botsort import BotSort


class FaceTracker:
    def __init__(self, det_thresh: float = 0.3, device: str = "cpu", track_buffer: int = 60):
        providers = (
            ["CoreMLExecutionProvider", "CPUExecutionProvider"]
            if device == "mps"
            else ["CPUExecutionProvider"]
        )
        self._detector = FaceAnalysis(allowed_modules=["detection"], providers=providers)
        self._detector.prepare(ctx_id=0, det_thresh=det_thresh, det_size=(640, 640))

        # with_reid=False: no ReID weights needed; IoU + Kalman is sufficient for seated meetings
        # track_buffer=60: keep lost tracks alive for 2s at 30fps
        self._tracker = BotSort(
            reid_model=None,
            with_reid=False,
            track_buffer=track_buffer,
            frame_rate=30,
        )

    def update(self, frame: np.ndarray, ts_ms: float) -> list[dict]:
        """
        Returns [{track_id, bbox, crop, ts_ms}] for each tracked face.
        bbox: [x, y, w, h] pixels
        crop: grayscale uint8 (224, 224)
        """
        faces = self._detector.get(frame)

        if not faces:
            self._tracker.update(np.empty((0, 6)), frame)
            return []

        dets = np.array(
            [[*face.bbox, face.det_score, 0] for face in faces], dtype=np.float32
        )
        tracks = self._tracker.update(dets, frame)

        if tracks is None or len(tracks) == 0:
            return []

        h, w = frame.shape[:2]
        return [
            {
                "track_id": str(int(t[4])),
                "bbox": [int(t[0]), int(t[1]), int(t[2]) - int(t[0]), int(t[3]) - int(t[1])],
                "crop": _crop_face(frame, int(t[0]), int(t[1]), int(t[2]), int(t[3]), h, w),
                "ts_ms": ts_ms,
            }
            for t in tracks
        ]


def _crop_face(
    frame: np.ndarray, x1: int, y1: int, x2: int, y2: int, fh: int, fw: int
) -> np.ndarray:
    pad_x = int((x2 - x1) * 0.4)
    pad_y = int((y2 - y1) * 0.4)
    region = frame[
        max(0, y1 - pad_y) : min(fh, y2 + pad_y),
        max(0, x1 - pad_x) : min(fw, x2 + pad_x),
    ]
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    return cv2.resize(gray, (112, 112))
