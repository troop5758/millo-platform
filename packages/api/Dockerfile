FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY config ./config

RUN npm ci --ignore-scripts

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node","packages/api/src/index.js"]
