# Nyoni measurement service. Built by Railway from the repository root
# (RAILWAY_DOCKERFILE_PATH=measure/Dockerfile).
FROM python:3.11-slim

# MediaPipe needs EGL/GLES and OpenCV's GL and GLib libraries, even on CPU.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libegl1 libgles2 libgl1 libglib2.0-0 curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY measure/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# MediaPipe Pose Landmarker (heavy), Apache-2.0, from Google's model bucket.
RUN mkdir models && curl -fsSL -o models/pose_landmarker_heavy.task \
  https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task

COPY measure/engine.py measure/detect.py measure/app.py ./

RUN useradd --create-home app
USER app
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app:app --host :: --port ${PORT:-8000} --workers 1"]
