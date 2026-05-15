"""
Lip activity detection via optical flow on the mouth ROI.
Input:  list of consecutive base64-encoded face crop images (same tracked face across frames)
Output: {is_speaking: bool, confidence: float}

The mouth ROI is the bottom 30% of the face crop. We compute dense optical flow
between consecutive frames in that region; high mean flow magnitude → mouth is moving → speaking.
"""
import base64
import numpy as np
import cv2
from io import BytesIO
from PIL import Image

MOUTH_ROI_TOP_RATIO = 0.60    # bottom 40% of face is mouth region
SPEAKING_FLOW_THRESHOLD = 1.5  # mean pixel displacement per frame to classify as speaking


def _decode_gray(b64: str) -> np.ndarray:
    img_bytes = base64.b64decode(b64)
    img = Image.open(BytesIO(img_bytes)).convert("L")  # grayscale
    return np.array(img, dtype=np.uint8)


def _mouth_roi(frame: np.ndarray) -> np.ndarray:
    h = frame.shape[0]
    return frame[int(h * MOUTH_ROI_TOP_RATIO):, :]


def detect(face_crops_b64: list[str]) -> dict:
    """
    face_crops_b64: sequence of at least 2 consecutive grayscale face crops (same track_id).
    Returns {is_speaking, confidence}.
    """
    if len(face_crops_b64) < 2:
        return {"is_speaking": False, "confidence": 0.0}

    frames = [_decode_gray(b) for b in face_crops_b64]
    flow_magnitudes = []

    for i in range(1, len(frames)):
        prev = _mouth_roi(frames[i - 1])
        curr = _mouth_roi(frames[i])

        if prev.shape != curr.shape:
            # Resize to match if crops differ slightly
            curr = cv2.resize(curr, (prev.shape[1], prev.shape[0]))

        flow = cv2.calcOpticalFlowFarneback(
            prev, curr, None,
            pyr_scale=0.5, levels=3, winsize=15,
            iterations=3, poly_n=5, poly_sigma=1.2, flags=0,
        )
        magnitude = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2).mean()
        flow_magnitudes.append(magnitude)

    mean_magnitude = float(np.mean(flow_magnitudes))
    is_speaking = mean_magnitude > SPEAKING_FLOW_THRESHOLD
    # Sigmoid-ish confidence mapped to [0, 1] around the threshold
    confidence = float(1 / (1 + np.exp(-2 * (mean_magnitude - SPEAKING_FLOW_THRESHOLD))))

    return {"is_speaking": is_speaking, "confidence": round(confidence, 3)}
