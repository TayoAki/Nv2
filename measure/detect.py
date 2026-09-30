"""MediaPipe Pose: person mask and landmarks for one photo."""

from __future__ import annotations

import io
import os

import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python import vision
from PIL import Image, ImageOps

from engine import MeasureError, View

MODEL_PATH = os.environ.get("POSE_MODEL", os.path.join(os.path.dirname(__file__), "models", "pose_landmarker_heavy.task"))
MAX_EDGE = 1600

_landmarker = None


def landmarker():
    global _landmarker
    if _landmarker is None:
        options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=vision.RunningMode.IMAGE,
            num_poses=2,
            output_segmentation_masks=True,
            min_pose_detection_confidence=0.5,
        )
        _landmarker = vision.PoseLandmarker.create_from_options(options)
    return _landmarker


def load_image(data: bytes) -> np.ndarray:
    try:
        image = Image.open(io.BytesIO(data))
        image = ImageOps.exif_transpose(image).convert("RGB")
    except Exception as error:  # noqa: BLE001 - any decode failure means an unreadable photo
        raise MeasureError("bad_image", "We couldn't read this photo. Use a JPEG, PNG or WebP.") from error
    image.thumbnail((MAX_EDGE, MAX_EDGE))
    return np.asarray(image)


def detect(pixels: np.ndarray) -> View:
    height, width = pixels.shape[:2]
    result = landmarker().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(pixels)))
    if not result.pose_landmarks:
        raise MeasureError("no_person", "We couldn't find a person in this photo.")
    # The largest mask is the subject; a second detected pose means someone else is in view.
    masks = [m.numpy_view() > 0.5 for m in (result.segmentation_masks or [])]
    if not masks:
        raise MeasureError("no_person", "We couldn't find a person in this photo.")
    order = sorted(range(len(masks)), key=lambda i: -int(masks[i].sum()))
    main = order[0]
    mask = masks[main]
    if mask.ndim == 3:
        mask = mask[..., 0]
    mask = _largest_component(mask)
    landmarks = [(lm.x * width, lm.y * height, lm.visibility if lm.visibility is not None else 1.0) for lm in result.pose_landmarks[main]]
    extra = sum(1 for i in order[1:] if masks[i].sum() > 0.2 * masks[main].sum())
    return View(mask=mask, landmarks=landmarks, extra_people=extra)


def _largest_component(mask: np.ndarray) -> np.ndarray:
    """Drop specks of background the segmenter marked as person."""
    from scipy import ndimage  # local import: only needed here

    labels, count = ndimage.label(mask)
    if count <= 1:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    return labels == (int(np.argmax(sizes)) + 1)
