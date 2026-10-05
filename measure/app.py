"""
Measurement service: POST two photos and a height, get body measurements back.

Called only by the Nyoni API server over Railway's private network, with a shared token.
Photos are processed in memory and never written to disk or logged.
"""

from __future__ import annotations

import hmac
import os

from fastapi import FastAPI, File, Form, Header, UploadFile
from fastapi.responses import JSONResponse

from detect import detect, landmarker, load_image
from engine import MeasureError, check_front, check_side, measure

TOKEN = os.environ.get("MEASURE_TOKEN", "")
MAX_BYTES = 12 * 1024 * 1024

app = FastAPI(title="Nyoni measure", docs_url=None, redoc_url=None, openapi_url=None)


@app.on_event("startup")
def warm() -> None:
    landmarker()  # load the model once, before the first request


@app.get("/health")
def health() -> dict:
    return {"ok": True}


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.post("/measure")
async def measure_photos(
    front: UploadFile = File(...),
    side: UploadFile = File(...),
    heightCm: float = Form(...),
    authorization: str = Header(default=""),
):
    if not TOKEN or not hmac.compare_digest(authorization, f"Bearer {TOKEN}"):
        return error(401, "unauthorized", "Not allowed.")
    front_bytes, side_bytes = await front.read(MAX_BYTES + 1), await side.read(MAX_BYTES + 1)
    if len(front_bytes) > MAX_BYTES or len(side_bytes) > MAX_BYTES:
        return error(413, "too_large", "Use photos under 12 MB.")
    try:
        front_px, side_px = load_image(front_bytes), load_image(side_bytes)
        result = measure(detect(front_px), detect(side_px), heightCm, front_px.shape[0], side_px.shape[0])
    except MeasureError as problem:
        return error(422, problem.code, problem.message)
    finally:
        del front_bytes, side_bytes
    result.pop("rows", None)
    return result


@app.post("/check")
async def check_photo(
    photo: UploadFile = File(...),
    view: str = Form(...),
    authorization: str = Header(default=""),
):
    """One photo during a guided scan: is the pose right? Answers in under a second."""
    if not TOKEN or not hmac.compare_digest(authorization, f"Bearer {TOKEN}"):
        return error(401, "unauthorized", "Not allowed.")
    if view not in ("front", "side"):
        return error(400, "bad_view", "Say which photo this is.")
    data = await photo.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        return error(413, "too_large", "Use a photo under 12 MB.")
    try:
        pixels = load_image(data)
        found = detect(pixels)
        (check_front if view == "front" else check_side)(found, pixels.shape[0])
    except MeasureError as problem:
        return error(422, problem.code, problem.message)
    finally:
        del data
    return {"ok": True}
