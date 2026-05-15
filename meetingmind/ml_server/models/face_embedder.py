"""
InsightFace / ArcFace — extracts 512-dim face embedding from a face crop.
Input:  base64-encoded face crop image
Output: 512-dim float list (L2-normalized)
"""
import base64
import numpy as np
from io import BytesIO
from PIL import Image
import insightface
from insightface.app import FaceAnalysis

_app: FaceAnalysis | None = None


def load():
    global _app
    _app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    _app.prepare(ctx_id=0, det_size=(640, 640))


def embed(face_crop_b64: str) -> list[float]:
    assert _app is not None, "Call load() first"
    img_bytes = base64.b64decode(face_crop_b64)
    img = np.array(Image.open(BytesIO(img_bytes)).convert("RGB"))

    faces = _app.get(img)
    if not faces:
        raise ValueError("No face detected in crop")

    # Take the highest-confidence face
    face = max(faces, key=lambda f: f.det_score)
    embedding = face.embedding  # 512-dim numpy array, already L2-normalized by InsightFace
    return embedding.tolist()
