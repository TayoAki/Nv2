"""
Fit CALIBRATION factors from real people measured with a tape.

Usage:  python calibrate.py people.csv

people.csv columns: front, side, heightCm, and any of chest, waist, trouserWaist, hips,
neck, thigh, shoulderWidth, sleeve, inseam, outseam (tape measurements in cm). Paths are
relative to the CSV. Measure over fitted clothing, the way a tailor would.

Prints, per measurement: the typical error before and after calibration, and the factor
to put in engine.CALIBRATION. Aim for 10+ people across builds (the plan's benchmark).
"""

from __future__ import annotations

import csv
import os
import statistics
import sys

from detect import detect, load_image
from engine import CALIBRATION, MeasureError, measure


def main(path: str) -> None:
    base = os.path.dirname(os.path.abspath(path))
    ratios: dict[str, list[float]] = {}
    errors: dict[str, list[tuple[float, float]]] = {}
    with open(path, newline="") as handle:
        for row in csv.DictReader(handle):
            front = load_image(open(os.path.join(base, row["front"]), "rb").read())
            side = load_image(open(os.path.join(base, row["side"]), "rb").read())
            try:
                result = measure(detect(front), detect(side), float(row["heightCm"]), front.shape[0], side.shape[0])
            except MeasureError as problem:
                print(f"skip {row['front']}: {problem.code}")
                continue
            for name, estimate in result["measurementsCm"].items():
                tape = row.get(name)
                if not tape:
                    continue
                raw = estimate / CALIBRATION.get(name, 1.0)
                ratios.setdefault(name, []).append(float(tape) / raw)
                errors.setdefault(name, []).append((raw, float(tape)))

    print(f"{'measurement':<14}{'people':>7}{'error now':>11}{'after':>9}{'factor':>9}")
    for name, values in sorted(ratios.items()):
        factor = statistics.median(values)
        before = statistics.mean(abs(raw * CALIBRATION.get(name, 1.0) - tape) for raw, tape in errors[name])
        after = statistics.mean(abs(raw * factor - tape) for raw, tape in errors[name])
        print(f"{name:<14}{len(values):>7}{before:>9.1f}cm{after:>7.1f}cm{factor:>9.3f}")


if __name__ == "__main__":
    main(sys.argv[1])
