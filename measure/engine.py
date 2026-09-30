"""
Body measurements from a front and a side photo.

The method is the tailor's-silhouette approach used by several open-source tools:

1. MediaPipe Pose gives a person mask (silhouette) and 33 body landmarks for each photo.
2. The shopper's height divided by their height in pixels gives centimetres per pixel.
3. Levels (chest, waist, hips, neck, thigh) are placed from the landmarks.
4. At each level the front silhouette gives the width and the side silhouette the depth.
   The circumference is the perimeter of an ellipse with that width and depth.
5. Lengths (sleeve, inseam, outseam, shoulders) come from landmarks and the silhouette.

This module is pure geometry on numpy arrays, so it can be tested without MediaPipe.
Nothing here is a fit guarantee: results are estimates that need calibrating against
tape measurements (see CALIBRATION).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

# MediaPipe Pose landmark indices.
NOSE, MOUTH_L, MOUTH_R = 0, 9, 10
SHOULDER_L, SHOULDER_R = 11, 12
ELBOW_L, ELBOW_R = 13, 14
WRIST_L, WRIST_R = 15, 16
HIP_L, HIP_R = 23, 24
ANKLE_L, ANKLE_R = 27, 28

# False until CALIBRATION holds factors fitted to tape measurements of real people.
CALIBRATED = False

# Multipliers applied to raw estimates. 1.0 until calibrated against tape measurements of
# real people (the plan's benchmark: 10+ adults, tape vs app). Update these, not the code.
CALIBRATION: dict[str, float] = {
    "neck": 1.0,
    "chest": 1.0,
    "waist": 1.0,
    "trouserWaist": 1.0,
    "hips": 1.0,
    "thigh": 1.0,
    "shoulderWidth": 1.0,
    "sleeve": 1.0,
    "inseam": 1.0,
    "outseam": 1.0,
}


class MeasureError(Exception):
    """A photo can't be measured. `code` is stable for the app; `message` is shown to shoppers."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class View:
    """One photo: a boolean person mask (H×W) and landmarks as (x, y, visibility) in pixels."""

    mask: np.ndarray
    landmarks: list[tuple[float, float, float]]
    extra_people: int = 0

    top: int = field(init=False)
    bottom: int = field(init=False)

    def __post_init__(self):
        rows = np.flatnonzero(self.mask.any(axis=1))
        if rows.size == 0:
            raise MeasureError("no_person", "We couldn't find a person in this photo.")
        self.top, self.bottom = int(rows[0]), int(rows[-1])

    @property
    def pixel_height(self) -> int:
        return self.bottom - self.top + 1

    def lm(self, index: int) -> tuple[float, float]:
        x, y, _ = self.landmarks[index]
        return x, y

    def visible(self, index: int, threshold: float = 0.5) -> bool:
        return self.landmarks[index][2] >= threshold

    def level_from_floor(self, y: float) -> float:
        """Fraction of body height above the floor for a row (0 = floor, 1 = top of head)."""
        return (self.bottom - y) / self.pixel_height

    def row_at(self, fraction: float) -> int:
        return int(round(self.bottom - fraction * self.pixel_height))


def run_width(mask: np.ndarray, row: int, x: float) -> tuple[int, int] | None:
    """The contiguous run of mask pixels on `row` that contains column `x`, as (start, end)."""
    if row < 0 or row >= mask.shape[0]:
        return None
    line = mask[row]
    cx = int(round(x))
    if cx < 0 or cx >= line.size or not line[cx]:
        # Allow a couple of pixels of slack around the centre line.
        for dx in (1, -1, 2, -2, 3, -3):
            if 0 <= cx + dx < line.size and line[cx + dx]:
                cx += dx
                break
        else:
            return None
    start = cx
    while start > 0 and line[start - 1]:
        start -= 1
    end = cx
    while end < line.size - 1 and line[end + 1]:
        end += 1
    return start, end


def runs_on_row(mask: np.ndarray, row: int) -> int:
    line = mask[row].astype(np.int8)
    return int(np.count_nonzero(np.diff(np.concatenate(([0], line, [0]))) == 1))


def ellipse_perimeter(width: float, depth: float) -> float:
    """Ramanujan's approximation for an ellipse with the given full width and depth."""
    a, b = width / 2, depth / 2
    return math.pi * (3 * (a + b) - math.sqrt((3 * a + b) * (a + 3 * b)))


def _torso_x(view: View) -> float:
    xs = [view.lm(i)[0] for i in (SHOULDER_L, SHOULDER_R, HIP_L, HIP_R)]
    return float(np.mean(xs))


def _width_at(view: View, row: int, x: float) -> float | None:
    run = run_width(view.mask, row, x)
    return None if run is None else float(run[1] - run[0] + 1)


def check_front(view: View, image_height: int) -> None:
    _check_common(view, image_height)
    shoulder_span = abs(view.lm(SHOULDER_L)[0] - view.lm(SHOULDER_R)[0]) / view.pixel_height
    if shoulder_span < 0.14:
        raise MeasureError("wrong_view", "The first photo should face the camera. Stand square to it.")
    # Arms held out in an A: at waist level the silhouette must split into arm, torso, arm.
    sh_y = np.mean([view.lm(SHOULDER_L)[1], view.lm(SHOULDER_R)[1]])
    hip_y = np.mean([view.lm(HIP_L)[1], view.lm(HIP_R)[1]])
    rows = (int(sh_y + 0.45 * (hip_y - sh_y)), int(sh_y + 0.7 * (hip_y - sh_y)))
    if any(runs_on_row(view.mask, row) < 3 for row in rows):
        raise MeasureError(
            "arms_touching",
            "Hold your arms out and down in an A shape so there's a gap between your arms and body.",
        )


def check_side(view: View, image_height: int) -> None:
    _check_common(view, image_height)
    shoulder_span = abs(view.lm(SHOULDER_L)[0] - view.lm(SHOULDER_R)[0]) / view.pixel_height
    if shoulder_span > 0.08:
        raise MeasureError("wrong_view", "The second photo should be side-on. Turn 90° to the camera.")


def _check_common(view: View, image_height: int) -> None:
    if view.extra_people:
        raise MeasureError("multiple_people", "Only one person should be in the photo.")
    margin = 0.005 * image_height
    if view.top <= margin or view.bottom >= image_height - 1 - margin:
        raise MeasureError("not_full_body", "Step back so your whole body, head to feet, is in the photo.")
    # Side-on, the far shoulder, hip and ankle are hidden: one of each pair is enough.
    for group in ((NOSE,), (SHOULDER_L, SHOULDER_R), (HIP_L, HIP_R), (ANKLE_L, ANKLE_R)):
        if not any(view.visible(index, 0.3) for index in group):
            raise MeasureError("not_full_body", "Step back so your whole body, head to feet, is in the photo.")
    if view.pixel_height < 0.45 * image_height:
        raise MeasureError("too_far", "Move a little closer so you fill most of the photo's height.")


def measure(front: View, side: View, height_cm: float, front_image_height: int, side_image_height: int) -> dict:
    if not 120 <= height_cm <= 230:
        raise MeasureError("bad_height", "Enter your height between 120 and 230 cm.")
    check_front(front, front_image_height)
    check_side(side, side_image_height)

    f_scale = height_cm / front.pixel_height
    s_scale = height_cm / side.pixel_height
    cx = _torso_x(front)
    side_x = _torso_x(side)

    sh_y = float(np.mean([front.lm(SHOULDER_L)[1], front.lm(SHOULDER_R)[1]]))
    hip_y = float(np.mean([front.lm(HIP_L)[1], front.lm(HIP_R)[1]]))
    torso = hip_y - sh_y

    def band(lo: float, hi: float) -> range:
        return range(int(sh_y + lo * torso), int(sh_y + hi * torso) + 1)

    def depth_at_front_row(row: int, x: float | None = None) -> float | None:
        side_row = side.row_at(front.level_from_floor(row))
        w = _width_at(side, side_row, side_x if x is None else x)
        return None if w is None else w * s_scale

    def circumference(row: int) -> tuple[float, float, float] | None:
        w = _width_at(front, row, cx)
        d = depth_at_front_row(row)
        if w is None or d is None:
            return None
        width_cm = w * f_scale
        return ellipse_perimeter(width_cm, d), width_cm, d

    # Crotch: first row below the hips where the centre line leaves the silhouette (legs part).
    crotch_y = None
    for row in range(int(hip_y), front.bottom):
        if not front.mask[row, int(round(cx))]:
            crotch_y = row
            break
    if crotch_y is None:
        raise MeasureError("legs_together", "Stand with your feet a little apart so there's a gap between your legs.")

    out: dict[str, float] = {}
    detail: dict[str, dict] = {}

    # Chest: fullest point just below the armpits. Above the armpits the arms join the
    # silhouette, so only rows where arm, torso and arm are separate runs count.
    armpit_row = next((r for r in band(0.05, 0.6) if runs_on_row(front.mask, r) >= 3), None)
    if armpit_row is None:
        raise MeasureError("arms_touching", "Hold your arms out and down in an A shape so there's a gap between your arms and body.")
    chest_start = armpit_row + int(0.01 * front.pixel_height)
    chest_rows = [r for r in range(chest_start, chest_start + int(0.12 * torso)) if runs_on_row(front.mask, r) >= 3]
    chest_row = max(chest_rows or [chest_start], key=lambda r: _width_at(front, r, cx) or 0)
    # Natural waist: narrowest point of the torso.
    waist_row = min(band(0.55, 0.85), key=lambda r: _width_at(front, r, cx) or 1e9)
    # Trouser waist: where menswear trousers sit, just above the hip joints.
    trouser_row = int(sh_y + 0.9 * torso)
    # Seat / hips: widest point between the hip joints and just above the crotch.
    hip_rows = range(int(hip_y), max(int(hip_y) + 1, crotch_y - 2))
    hips_row = max(hip_rows, key=lambda r: _width_at(front, r, cx) or 0)

    for name, row in (("chest", chest_row), ("waist", waist_row), ("trouserWaist", trouser_row), ("hips", hips_row)):
        c = circumference(row)
        if c is None:
            raise MeasureError("unclear_silhouette", "We couldn't see your outline clearly. Use a plain background and fitted clothes.")
        out[name] = c[0]
        detail[name] = {"widthCm": round(c[1], 1), "depthCm": round(c[2], 1)}

    # Neck: narrowest row between the mouth and the shoulders.
    mouth_y = float(np.mean([front.lm(MOUTH_L)[1], front.lm(MOUTH_R)[1]]))
    neck_x = front.lm(NOSE)[0]
    neck_rows = range(int(mouth_y + 0.25 * (sh_y - mouth_y)), int(sh_y - 0.15 * (sh_y - mouth_y)))
    if len(neck_rows) > 0:
        # The neck is the narrowest point in each view, and those rows can differ slightly
        # (the jaw hangs lower at the front), so each view takes its own minimum.
        widths = [w for r in neck_rows if (w := _width_at(front, r, neck_x))]
        side_neck_x = side.lm(NOSE)[0] * 0.5 + side_x * 0.5
        side_rows = range(side.row_at(front.level_from_floor(neck_rows[0])), side.row_at(front.level_from_floor(neck_rows[-1])) + 1)
        depths = [d for r in side_rows if (d := _width_at(side, r, side_neck_x))]
        if widths and depths:
            out["neck"] = ellipse_perimeter(min(widths) * f_scale, min(depths) * s_scale)

    # Thigh: one leg, 4% of height below the crotch.
    thigh_row = crotch_y + int(0.04 * front.pixel_height)
    leg_x = front.lm(HIP_L)[0]
    w = _width_at(front, thigh_row, leg_x)
    d = depth_at_front_row(thigh_row)
    if w and d:
        out["thigh"] = ellipse_perimeter(w * f_scale, d)

    # Lengths.
    def dist(a: int, b: int) -> float:
        (ax, ay), (bx, by) = front.lm(a), front.lm(b)
        return math.hypot(ax - bx, ay - by)

    # Shoulders: the outline across the shoulders at the shoulder joints. The landmarks mark
    # the joints themselves, which sit inside the tailor's shoulder points.
    joints = dist(SHOULDER_L, SHOULDER_R)
    outline = _width_at(front, int(sh_y), cx) or joints
    out["shoulderWidth"] = outline * f_scale
    # Sleeve: from the outer shoulder point, down the arm to the wrist.
    arm = float(np.mean([dist(SHOULDER_L, ELBOW_L) + dist(ELBOW_L, WRIST_L), dist(SHOULDER_R, ELBOW_R) + dist(ELBOW_R, WRIST_R)]))
    out["sleeve"] = (arm + max(0.0, (outline - joints) / 2)) * f_scale
    out["inseam"] = (front.bottom - crotch_y) * f_scale
    out["outseam"] = (front.bottom - trouser_row) * f_scale

    rows = {"chest": chest_row, "waist": waist_row, "trouserWaist": trouser_row, "hips": hips_row, "crotch": crotch_y, "thigh": thigh_row}
    measurements = {k: round(v * CALIBRATION.get(k, 1.0), 1) for k, v in out.items()}
    return {
        "heightCm": round(height_cm, 1),
        "measurementsCm": measurements,
        "suggestedSizes": suggested_sizes(measurements, height_cm),
        "detail": detail,
        "rows": rows,
        "calibrated": CALIBRATED,
    }


def suggested_sizes(m: dict[str, float], height_cm: float) -> dict:
    """US menswear conventions: suit size ≈ chest in inches (even sizes); length from height."""
    inch = 2.54
    chest_in = m["chest"] / inch
    jacket = int(2 * round(chest_in / 2))
    length = "S" if height_cm < 173 else "R" if height_cm < 186 else "L"
    waist_in = m["trouserWaist"] / inch
    trouser_waist = int(2 * round(waist_in / 2))
    return {
        "jacket": f"{jacket}{length}",
        "jacketChestIn": round(chest_in, 1),
        "trouserWaistIn": trouser_waist,
        "inseamIn": round(m["inseam"] / inch),
        "shirtNeckIn": round(m["neck"] / inch * 2) / 2 if "neck" in m else None,
        # Shirt sleeves are measured from the centre back of the neck to the wrist.
        "shirtSleeveIn": round((m["shoulderWidth"] / 2 + m["sleeve"]) / inch),
    }
