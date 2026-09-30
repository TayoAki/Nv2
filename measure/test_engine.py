"""Geometry tests on a synthetic figure whose true measurements are known exactly.

Scale: 1700 px tall for 170 cm, so 1 px = 0.1 cm.
"""

import math

import numpy as np
import pytest

from engine import (
    ANKLE_L, ANKLE_R, ELBOW_L, ELBOW_R, HIP_L, HIP_R, MOUTH_L, MOUTH_R, NOSE,
    SHOULDER_L, SHOULDER_R, WRIST_L, WRIST_R, MeasureError, View, ellipse_perimeter, measure,
)

H, W = 2000, 1400
TOP, BOTTOM = 100, 1799  # 1700 px
CX = 700
SH_Y, HIP_Y = 406, 916
CROTCH_Y = 1086


def landmarks(shoulder_half: float, hip_half: float, arm_x: float) -> list:
    lms = [(CX, 600.0, 1.0)] * 33
    lms = list(lms)
    lms[NOSE] = (CX, 210.0, 1.0)
    lms[MOUTH_L] = (CX - 20, 260.0, 1.0)
    lms[MOUTH_R] = (CX + 20, 260.0, 1.0)
    lms[SHOULDER_L] = (CX + shoulder_half, SH_Y, 1.0)
    lms[SHOULDER_R] = (CX - shoulder_half, SH_Y, 1.0)
    lms[ELBOW_L] = (CX + arm_x, 650.0, 1.0)
    lms[ELBOW_R] = (CX - arm_x, 650.0, 1.0)
    lms[WRIST_L] = (CX + arm_x, 880.0, 1.0)
    lms[WRIST_R] = (CX - arm_x, 880.0, 1.0)
    lms[HIP_L] = (CX + hip_half, HIP_Y, 1.0)
    lms[HIP_R] = (CX - hip_half, HIP_Y, 1.0)
    lms[ANKLE_L] = (CX + 95, 1780.0, 1.0)
    lms[ANKLE_R] = (CX - 95, 1780.0, 1.0)
    return lms


def head_and_neck(mask: np.ndarray, neck_w: int) -> None:
    yy, xx = np.ogrid[:H, :W]
    mask |= (yy - (TOP + 110)) ** 2 + (xx - CX) ** 2 <= 110 ** 2
    mask[TOP + 200 : SH_Y + 1, CX - neck_w // 2 : CX + neck_w // 2] = True


def front_view(arms_touching=False, legs_together=False) -> View:
    m = np.zeros((H, W), bool)
    head_and_neck(m, 120)  # neck width 12 cm
    # Torso 36 cm, narrowing to 30 cm at the waist, 38 cm at the hips.
    m[SH_Y:HIP_Y, CX - 180 : CX + 180] = True
    waist_top, waist_bottom = SH_Y + int(0.6 * (HIP_Y - SH_Y)), SH_Y + int(0.75 * (HIP_Y - SH_Y))
    m[waist_top:waist_bottom, CX - 180 : CX - 150] = False
    m[waist_top:waist_bottom, CX + 150 : CX + 180] = False
    m[HIP_Y:CROTCH_Y, CX - 190 : CX + 190] = True
    # Legs 15 cm wide with a 4 cm gap (or together).
    gap = 0 if legs_together else 20
    m[CROTCH_Y:BOTTOM + 1, CX - gap - 150 : CX - gap] = True
    m[CROTCH_Y:BOTTOM + 1, CX + gap : CX + gap + 150] = True
    # Arms 8 cm wide, 3 cm from the torso (or touching it).
    offset = 180 if arms_touching else 210
    for sign in (-1, 1):
        a, b = sorted((CX + sign * offset, CX + sign * (offset + 80)))
        m[SH_Y:HIP_Y + 50, a:b] = True
        # Arms join the torso down to the armpits, like a real silhouette.
        lo, hi = sorted((CX + sign * 170, CX + sign * (offset + 1)))
        m[SH_Y : SH_Y + 60, lo:hi] = True
    return View(mask=m, landmarks=landmarks(170, 120, 250))


def side_view() -> View:
    m = np.zeros((H, W), bool)
    head_and_neck(m, 110)  # neck depth 11 cm
    m[SH_Y:HIP_Y, CX - 120 : CX + 120] = True  # chest depth 24 cm
    waist_top, waist_bottom = SH_Y + int(0.6 * (HIP_Y - SH_Y)), SH_Y + int(0.75 * (HIP_Y - SH_Y))
    m[waist_top:waist_bottom, CX - 120 : CX - 110] = False  # waist depth 22 cm
    m[waist_top:waist_bottom, CX + 110 : CX + 120] = False
    m[HIP_Y:CROTCH_Y, CX - 130 : CX + 130] = True  # hip depth 26 cm
    m[CROTCH_Y:BOTTOM + 1, CX - 80 : CX + 80] = True  # thigh depth 16 cm
    return View(mask=m, landmarks=landmarks(10, 10, 20))


def close(actual, expected, tolerance=0.01):
    assert abs(actual - expected) <= tolerance * expected + 0.2, f"{actual} vs {expected}"


def test_ellipse_perimeter():
    assert math.isclose(ellipse_perimeter(10, 10), math.pi * 10, rel_tol=1e-9)
    # A 36 × 24 cm ellipse: 95.19 cm.
    assert math.isclose(ellipse_perimeter(36, 24), 95.19, rel_tol=1e-3)


def test_measures_the_synthetic_figure():
    result = measure(front_view(), side_view(), 170, H, H)
    m = result["measurementsCm"]
    close(m["chest"], ellipse_perimeter(36, 24))
    close(m["waist"], ellipse_perimeter(30, 22))
    close(m["hips"], ellipse_perimeter(38, 26))
    close(m["neck"], ellipse_perimeter(12, 11))
    close(m["thigh"], ellipse_perimeter(15, 16))
    close(m["inseam"], (BOTTOM - CROTCH_Y + 1) * 0.1)
    # Across the shoulder outline: torso and joined arms, 58 cm.
    close(m["shoulderWidth"], 58.0)
    assert result["calibrated"] is False
    sizes = result["suggestedSizes"]
    assert sizes["jacket"] == "38S"  # 94.9 cm chest = 37.4 in; 170 cm tall
    assert sizes["inseamIn"] == 28


def test_rejects_arms_against_the_body():
    with pytest.raises(MeasureError) as error:
        measure(front_view(arms_touching=True), side_view(), 170, H, H)
    assert error.value.code == "arms_touching"


def test_rejects_legs_together():
    with pytest.raises(MeasureError) as error:
        measure(front_view(legs_together=True), side_view(), 170, H, H)
    assert error.value.code == "legs_together"


def test_rejects_swapped_photos():
    with pytest.raises(MeasureError) as error:
        measure(side_view(), front_view(), 170, H, H)
    assert error.value.code == "wrong_view"


def test_rejects_a_cropped_photo():
    front = front_view()
    front.mask[BOTTOM - 40 :, :] = False
    front.mask[H - 1, CX - 50 : CX + 50] = True  # touches the bottom edge
    with pytest.raises(MeasureError) as error:
        measure(View(mask=front.mask, landmarks=front.landmarks), side_view(), 170, H, H)
    assert error.value.code == "not_full_body"


def test_rejects_a_second_person():
    front = front_view()
    front.extra_people = 1
    with pytest.raises(MeasureError) as error:
        measure(front, side_view(), 170, H, H)
    assert error.value.code == "multiple_people"


def test_rejects_an_impossible_height():
    with pytest.raises(MeasureError) as error:
        measure(front_view(), side_view(), 90, H, H)
    assert error.value.code == "bad_height"
