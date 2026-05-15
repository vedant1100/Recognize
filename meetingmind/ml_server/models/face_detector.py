"""
YOLOv8-Face — detects face bounding boxes in a video frame.
Input:  base64-encoded JPEG/PNG frame
Output: list of {bbox: {x, y, w, h}, confidence}
"""
import base64
import numpy as np
from io import BytesIO
from PIL import Image
from ultralytics import YOLO

_model: YOLO | None = None


def load():
    global _model
    _model = YOLO("yolov8n-face.pt")  # download on first run


def detect(frame_b64: str) -> list[dict]:
    assert _model is not None, "Call load() first"
    img_bytes = base64.b64decode(frame_b64)
    img = Image.open(BytesIO(img_bytes)).convert("RGB")
    frame_np = np.array(img)

    results = _model(frame_np, verbose=False)[0]
    detections = []
    for box in results.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        detections.append({
            "bbox": {"x": int(x1), "y": int(y1), "w": int(x2 - x1), "h": int(y2 - y1)},
            "confidence": float(box.conf[0]),
        })
    return detections
