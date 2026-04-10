FROM node:20-alpine AS builder
WORKDIR /app

COPY packages/web/package.json ./
RUN npm ci --ignore-scripts

COPY packages/web/ ./
ARG VITE_API_URL=http://localhost:3000
ARG VITE_SENTRY_DSN=
ARG VITE_APP_VERSION=3.0.0
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_APP_VERSION=$VITE_APP_VERSION
RUN npm run build

# Static nginx — production-friendly (fast ready probes, no Node preview server).
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY packages/web/nginx-spa.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
