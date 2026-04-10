# Feed reference stack → Millo mapping

**Production domain:** https://milloapp.com  

**Pipeline overview (user actions → Kafka → ranking → feed → UI):** **`docs/feed-pipeline-user-actions-to-client.md`**

This document relates the **Express / ESM “reference pack”** (heuristic-only tree, raw KafkaJS, `REDIS_URL`) to what **Millo 3.0 actually ships**: Fastify API, `@millo/database` schemas, `@millo/discovery` pipeline (cold start, business rules, A/B hooks), and `kafkaEventBus` + `emitFeedEvent`.

---

## Directory tree (reference vs Millo)

| Reference | Millo |
|-----------|--------|
| `server/models/*.model.js` | `packages/database/src/schemas/*.js` + facades `packages/api/src/server/models/*.model.js` |
| `server/services/kafka.js` (KafkaJS) | `packages/api/src/services/kafkaEventBus.js` (env `KAFKA_ENABLED`, retries, DLQ) |
| `server/services/redis.js` (`REDIS_URL`) | Same app uses `REDIS_HOST` / `REDIS_PORT` (and existing Redis helpers); trending cache keys unchanged in `@millo/discovery` |
| `server/services/feedEvents.producer.js` | `packages/api/src/services/feedEvents.producer.js` (allowlisted topics only) |
| `server/services/feed/*` (simplified JS) | `packages/discovery/src/*` (full pipeline) + API `vectorRetrieval` |
| `server/routes/feed.routes.js` (Express) | `packages/api/src/routes/feed.js` (Fastify) + `packages/api/src/server/routes/feed.routes.js` (re-export) |
| `workers/rankTrainingSample.worker.js` (standalone KafkaJS) | `packages/api/src/workers/rankTrainingSample.worker.js` + `packages/api/workers/rankTrainingSample.worker.js` shim |
| `web/.../useFeedTracking.js` (`api` service) | `packages/web/src/sdk/contentApi.js` + `packages/web/src/hooks/useFeedTracking.js` |
| `web/.../useForYouFeed.js` | `packages/web/src/hooks/useForYouFeed.js` → `fetchDiscoveryForYou` |

The reference **does not replace** discovery: ranking, filters, and rules stay in `@millo/discovery`. The reference **sessionContext** / **ranker** / **feed.service** snippets are useful mentally but are **not** copied verbatim into Millo.

---

## HTTP API (implemented on Millo)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/feed/for-you?limit=` | Bearer auth; `X-Session-Events` optional; blocks; Kafka `rank.predictions`. Disable: `FEED_FOR_YOU_ENABLED=false`. |
| GET | `/feed/realtime?limit=` | Bearer auth; **simple** `ranking.service.rankFeed` over **live** public streams. Enable: **`FEED_REALTIME_SIMPLE_ENABLED=true`**. |
| POST | `/feed/events/impression` | Body: `contentId` required; `eventType` forced to `impression`. Kafka `feed.impression`. |
| POST | `/feed/events/watch` | Body: `contentId`, `eventType` ∈ `play` \| `watch_*` \| `complete`. Kafka `feed.watch`. |
| POST | `/feed/events/engagement` | Body: `contentId`, `eventType` ∈ like, comment, share, follow_creator, gift, purchase. Kafka `feed.engagement`. |
| POST | `/feed/events/negative` | Body: `contentId`, `eventType` ∈ skip_fast, not_interested, report. Kafka `feed.negative`. |

All POST routes persist **`FeedEvent`** in MongoDB, then **`emitFeedEvent`**. Disable POST only: **`FEED_EVENTS_ENABLED=false`** (503).

**Granular web SDK** (`trackFeedWatchStart`, `trackFeedWatchProgress`, …) maps to the same **`watch`** / **`engagement`** endpoints with appropriate `eventType` values.

### Ops / seller / AI (admin or auth UI)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/ops/health` | Admin — basic status JSON |
| GET | `/ops/workers` | Admin — BullMQ queue dashboard payload |
| GET | `/ops/queues` | Admin — same source as workers (labeled queues) |
| GET/POST | `/seller/onboarding` | Auth — stub onboarding; `providerLive` when `SELLER_KYC_PROVIDER` set |
| GET | `/admin/ai-controls` | Admin — reads `AI_SHADOW_MODE`, `AI_MODERATION_ENABLED`, … |
| PUT | `/admin/ai-controls` | Admin — **501** read-only + `AdminAuditLog`; env is source of truth |

Optional body fields: `sessionId`, `watchTimeMs`, `position`, `source`, `topic`, `contentType`, `meta`, `ts`.

---

## Kafka topics (create in cluster)

- `feed.impression`
- `feed.watch`
- `feed.engagement`
- `feed.negative`
- `rank.predictions`

(Plus existing Millo topics per `kafkaEventBus.TOPICS`.)

---

## Environment variables

| Reference | Millo (typical) |
|-----------|------------------|
| `REDIS_URL` | `REDIS_HOST`, `REDIS_PORT` |
| `KAFKA_BROKERS` | `KAFKA_BROKERS` |
| `KAFKA_CLIENT_ID` | Optional; bus uses internal client id |
| — | `KAFKA_ENABLED=true` to publish |

---

## Web SDK

- `trackFeedImpression` / `trackFeedWatch` / `trackFeedEngagement` / `trackFeedNegative` → `contentApi.js`
- `useForYouFeed` → discovery For You
- `useFeedTracking` → session ring buffer + `fetchDiscoveryForYou` + re-exported `trackImpression` / `trackWatch` / … (swallows errors)

Integrate impressions into the existing **`ForYouPage`** (or a dedicated route) by calling `trackImpression` when items are shown — avoid duplicate full-page implementations unless product needs a demo view.

---

## Deployment notes (unchanged intent)

- Heuristic ranking runs out of the box via `@millo/discovery`.
- Vector ANN: stub / register backend in `packages/api/src/services/feed/vectorRetrieval.js`.
- Training worker: use API package worker wired to `eventBusOrchestrator`, not only stdout.
- Scale: indexes (`FeedEvent`, `ContentFeatures`, …) + Redis/Kafka capacity.
- `debug` on For You: use internal tooling only if extended in discovery; not required for the event POST API.

---

*Reference pack alignment — Millo 3.0.*
