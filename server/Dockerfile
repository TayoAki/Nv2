# Built by Railway from the repository root (RAILWAY_DOCKERFILE_PATH=server/Dockerfile).
# Only the server, the shared catalog and the capsule photos are copied; the Expo app isn't
# part of the image. Debian (glibc) for sharp's prebuilt image library; DejaVu so the
# "Simulated preview" label on placeholder renders has a font.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/src ./src
COPY shared /app/shared
# Garment references for renders (capsule photos by key).
COPY assets/collection /app/assets/collection

ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "src/index.ts"]
