FROM node:20-alpine AS base
WORKDIR /app

# Install workspace deps
COPY package.json package-lock.json* ./
COPY packages/api/package.json       ./packages/api/
COPY packages/database/package.json  ./packages/database/
COPY packages/notifications/package.json ./packages/notifications/
COPY packages/billing/package.json   ./packages/billing/
COPY packages/economy/package.json   ./packages/economy/

RUN npm ci --ignore-scripts --omit=dev

# Repo-root production profile (documentation vs deployment intent)
COPY config/              ./config/

# Copy source
COPY packages/api/        ./packages/api/
COPY packages/database/   ./packages/database/
COPY packages/notifications/ ./packages/notifications/
COPY packages/billing/    ./packages/billing/
COPY packages/economy/    ./packages/economy/

EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "packages/api/src/index.js"]
