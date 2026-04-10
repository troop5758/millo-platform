# Millo 3.0

A full-stack live-streaming and creator economy platform — real-time streams, gifts, subscriptions, a creator shop, auctions, direct messages, and an ad system.

---

## Architecture

```
packages/
  api/          Fastify REST + WebSocket backend
  web/          React + Vite SPA (web app)
  mobile/       Expo / React Native mobile app
  database/     Mongoose schemas (45 models)
  notifications/ Email (SMTP/SendGrid) + push (Expo/FCM/APNs)
  billing/      Stripe integration + webhooks
  economy/      Coins, gifts, pricing, ledger, revenue splits
infra/
  streaming/    nginx-rtmp Docker setup (RTMP ingest + HLS delivery)
```

---

## Quick Start (Docker)

```bash
# 1. Clone and enter the repo
git clone https://github.com/milloapp/millo.git
cd millo

# 2. Copy env vars and fill in required secrets
cp .env.example .env
# edit .env — at minimum set JWT_SECRET and MONGODB_URI

# 3. Start everything
docker-compose up --build

# Web  → http://localhost:5173
# API  → http://localhost:3000/health
# RTMP → rtmp://localhost:1935/live/<streamKey>
# HLS  → http://localhost:8080/live/<streamKey>/index.m3u8
```

---

## Local Development (no Docker)

### Prerequisites
- Node.js 20+
- MongoDB 7 (local or [Atlas free tier](https://www.mongodb.com/atlas))
- Redis 7 (optional — used for caching)

### Setup

```bash
# Install all workspace dependencies
npm install

# Copy env file
cp .env.example .env
# Fill in MONGODB_URI and JWT_SECRET at minimum
```

### Run each package

```bash
# API (port 3000)
cd packages/api && npm start

# Web (port 5173)
cd packages/web && npm run dev

# Mobile (Expo)
cd packages/mobile && npx expo start
```

---

## Environment Variables

See `.env.example` for a full list. Key required variables:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Long random string for session signing |
| `STRIPE_SECRET_KEY` | Stripe secret key for payments |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `EMAIL_PROVIDER` | `console` (dev) / `smtp` / `sendgrid` |
| `SENDGRID_API_KEY` | SendGrid API key (if using SendGrid) |
| `OAUTH_GOOGLE_ID/SECRET` | Google OAuth credentials |
| `EXPO_ACCESS_TOKEN` | Expo push notification access token |

---

## Features

### Users & Auth
- Email/password registration with email verification
- Google, Facebook, Apple OAuth
- Session-based auth with bcrypt password hashing
- Password reset via email token

### Live Streaming
- RTMP ingest via OBS / Streamlabs → nginx-rtmp → HLS delivery
- Real-time viewer count via WebSocket
- Live chat on stream page
- PPV (pay-per-view) streams
- Stream recording + VOD replay library

### Creator Economy
- **Coins** — purchase with Stripe Checkout, send as gifts
- **Gifts** — animated AI-quality gifts, sent during streams
- **Subscriptions** — monthly fan subscriptions per creator
- **Shop** — physical/digital products with Stripe checkout
- **Auctions** — real-time bidding with WebSocket updates
- **Payouts** — creator payout requests to admin

### Ads System
- Creator-managed ad campaigns (awareness, traffic, conversions)
- Multi-placement ads (feed, live, search, profile)
- Impression and click tracking
- Admin approval workflow

### Platform
- Multi-language (i18n) with RTL support
- Regional pricing with currency conversion
- Light / dark theme
- PWA with offline support + push notifications
- Admin dashboard with moderation queue, creator applications, kill switches
- Creator dashboard with revenue charts and analytics

### Mobile (Expo)
- iOS + Android via React Native
- HLS video playback (`react-native-video`)
- Push notifications (Expo Push API + FCM + APNs)
- Biometric authentication (Face ID / fingerprint)
- App lock after background

---

## API Routes

| Category | Base path |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Content | `GET /content/streams`, `GET /content/feed`, `GET /content/search` |
| Live | `POST /content/streams/start`, `POST /content/streams/:id/stop` |
| VOD | `GET /content/vod`, `GET /content/vod/:id` |
| Shop | `GET /shop/products`, `POST /shop/products`, `POST /shop/auctions/:id/bid` |
| Payments | `POST /payments/coins/checkout-session`, `POST /payments/shop/checkout` |
| DMs | `GET /dm/conversations`, `POST /dm/messages` |
| Notifications | `GET /content/notifications`, `POST /notifications/push-token` |
| Ads | `POST /ads/campaigns`, `GET /ads/feed`, `POST /ads/:id/click` |
| Moderation | `POST /moderation/report`, `GET /moderation/reports` |
| Creators | `POST /creators/apply`, `GET /creators/applications` |
| Admin | `GET /dashboards/admin/kpis`, `GET /dashboards/admin/users` |
| WebSocket | `GET /user/ws?token=`, `GET /live/ws?streamId=` |

---

## Streaming Setup (OBS)

1. Open OBS → Settings → Stream
2. Service: **Custom**
3. Server: `rtmp://your-server:1935/live`
4. Stream Key: paste the key from the Go Live page
5. Click **Start Streaming**

Playback URL: `https://hls.milloapp.com/live/<streamKey>/index.m3u8`

---

## Deployment

### API + Web (Cloud)
- Deploy to Railway, Render, or Fly.io using the provided Dockerfiles
- Set all environment variables in your platform's dashboard
- Point a MongoDB Atlas cluster at `MONGODB_URI`

### Streaming (VPS)
- Provision a VPS with Docker
- `cd infra/streaming && docker-compose up -d`
- Point DNS: `ingest.milloapp.com` → VPS IP, `hls.milloapp.com` → VPS IP
- Configure Cloudflare for HLS CDN caching

### Mobile (Expo EAS)
```bash
cd packages/mobile
npx eas build --platform all
npx eas submit
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | Fastify, Mongoose, WebSocket (`ws`) |
| Database | MongoDB 7 |
| Cache | Redis |
| Web | React 18, Vite, Tailwind CSS, i18next |
| Mobile | Expo 51, React Native, react-native-video |
| Payments | Stripe Checkout + PaymentIntents |
| Email | Nodemailer (SMTP / SendGrid) |
| Push | Expo Push API, FCM, APNs |
| Streaming | nginx-rtmp, HLS, FFmpeg |
| Auth | bcrypt, sessions, Google/Facebook/Apple OAuth |

---

## License

Proprietary — Millo App, Inc. All rights reserved.
