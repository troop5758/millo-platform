FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY config ./config

RUN npm ci --ignore-scripts

RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production

CMD ["node","packages/workers/src/index.js"]
