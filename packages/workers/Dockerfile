FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/workers/package.json ./packages/workers/
COPY packages/database/package.json ./packages/database/
COPY packages/billing/package.json ./packages/billing/
COPY packages/level-trust/package.json ./packages/level-trust/

RUN npm ci --ignore-scripts --omit=dev

# FFmpeg for video+audio composition worker (content compose)
RUN apk add --no-cache ffmpeg

COPY packages/workers/ ./packages/workers/
COPY packages/database/ ./packages/database/
COPY packages/billing/ ./packages/billing/
COPY packages/level-trust/ ./packages/level-trust/

ENV NODE_ENV=production
CMD ["node", "packages/workers/src/index.js"]
