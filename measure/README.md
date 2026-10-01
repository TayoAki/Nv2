# Nyoni measure

Body measurements from a front photo, a side photo and the shopper's height. A small Python service (FastAPI) that the Nyoni API calls over Railway's private network.

## Method

The tailor's-silhouette method, used by several open-source tools:

1. **Silhouette and landmarks:** [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (heavy model) finds the person's outline and 33 body landmarks in each photo.
2. **Scale:** the shopper's height divided by their height in pixels gives centimetres per pixel.
3. **Levels:** chest, waist, seat, neck and thigh are placed from the landmarks. The chest sits just below where the arms separate from the body, the waist is the narrowest point, and the crotch is where the legs part.
4. **Circumferences:** the front photo gives each level's width and the side photo its depth. The circumference is the perimeter of an ellipse with that width and depth.
5. **Lengths:** shoulders are measured across the outline at the shoulders. The sleeve runs from the outer shoulder point down the arm. Inseam is crotch to floor; outseam is trouser waist to floor.
6. **Suggested sizes:** US conventions. Suit size is the chest in inches (even sizes), with length S, R or L from height. Trousers use the waist in inches.

**Endpoints:** `POST /measure` (front, side, heightCm) and `POST /check` (photo, view). The check runs only the photo checks, so the app's guided scan can ask for a retake straight after each shot.

**Photo checks** stop with a message the shopper can act on: no person or more than one person, not full length, standing too far away, photos swapped, arms against the body, legs together.

**Privacy:** photos are processed in memory and never written to disk or logged. Only the numbers are returned.

## Accuracy

Results are **estimates** and are **not yet calibrated** (`CALIBRATED = False` in `engine.py`). Before trusting suggested sizes:

1. Measure 10 or more people of different builds with a tape, over fitted clothing.
2. Take their front and side photos as the app instructs.
3. Run `python calibrate.py people.csv`.
4. Put the printed factors into `CALIBRATION`, then set `CALIBRATED = True`.

The ellipse model tends to under-read the chest and seat, and loose clothing over-reads everything.

## Run it locally

```sh
pip install -r requirements.txt
mkdir -p models && curl -fsSL -o models/pose_landmarker_heavy.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task
MEASURE_TOKEN=dev uvicorn app:app --port 8200
python -m pytest test_engine.py   # geometry tests; no model needed
```

On Linux, MediaPipe needs `libegl1`, `libgles2`, `libgl1` and `libglib2.0-0`.

## Licences

- **MediaPipe** (library and Pose Landmarker model): Apache-2.0, so commercial use is allowed.
- **This code:** written for Nyoni. No code was copied from other projects. [Tapeline](https://github.com/raman365/tapeline), a browser tool built on the same method, has no licence, so it was used only as a reference for the approach.
- **Not used:** SMPL-based 3D body models (SMPLify-X, HMR). They need a commercial licence from Meshcapade.
