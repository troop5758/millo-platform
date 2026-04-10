# Millo 3.0 — API + workers. Production: https://milloapp.com
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/workers/package.json packages/workers/
COPY packages/database/package.json packages/database/
COPY packages/level-trust/package.json packages/level-trust/
COPY packages/live/package.json packages/live/
COPY packages/milla/package.json packages/milla/
COPY packages/economy/package.json packages/economy/
COPY packages/dm-monetization/package.json packages/dm-monetization/
COPY packages/discovery/package.json packages/discovery/
COPY packages/ads/package.json packages/ads/
COPY packages/billing/package.json packages/billing/
COPY packages/dashboards/package.json packages/dashboards/
COPY packages/compliance/package.json packages/compliance/
COPY packages/notifications/package.json packages/notifications/
COPY packages/tv/package.json packages/tv/
COPY packages/ai-optimization/package.json packages/ai-optimization/
COPY packages/self-observation/package.json packages/self-observation/
RUN npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts
COPY packages ./packages
RUN npm run build --workspaces --if-present 2>/dev/null || true

FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY config ./config
EXPOSE 3000
CMD ["node", "packages/api/src/index.js"]
