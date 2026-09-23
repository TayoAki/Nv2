# Built by Railway from the repository root (RAILWAY_DOCKERFILE_PATH=server/Dockerfile).
# Only the server and the shared catalog are copied; the Expo app isn't part of the image.
FROM node:22-alpine

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/src ./src
COPY shared /app/shared

ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "src/index.ts"]
