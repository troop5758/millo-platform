# Infrastructure stack — production map (Cursor / deploy)

This document maps the **growth / realtime infrastructure** you described to **this repository**.  
It is **not** the same as [Phase 2 — Database Schemas](./phase-2-database-schemas.md) (authoritative for MongoDB only).

**Production domain:** `https://milloapp.com`

**Global stack (users → CDN → geo DNS → K8s → services → Kafka → DB → S3):** see `infra/global-platform-stack.md`.

---

## Target architecture (your diagram)

```
Client (React)
   ↓
API Gateway (Node.js)
   ↓
────────────────────────────
| Redis   | Kafka | Janus  |
| Cache   | Events| WebRTC |
────────────────────────────
   ↓
Workers:
- FFmpeg Transcoder
- Feed Ranker
- Moderation Engine
```

---

## What is implemented in this repo today

| Layer | Your label | Millo implementation | Location / notes |
|--------|------------|----------------------|------------------|
| Client | React | Vite + React 18 SPA | `packages/web` |
| API | API Gateway (Node.js) | **Fastify** API (not Express) | `packages/api` — `src/index.js`, `src/app.js` |
| Redis | Cache + rate limiting | **Rate limit store** (optional cluster-wide) | `packages/api/src/lib/rateLimitRedisStore.js` — enable via `REDIS_URL` |
| Redis | Sessions | Auth uses DB-backed sessions + JWT patterns; Redis used where configured for rate limits | See `packages/api/src/routes/auth.js`, env `REDIS_URL` |
| Kafka | Event streaming | **Optional** event bus + topic ensure + consumers | `packages/api/src/services/kafkaEventBus.js`, `KAFKA_ENABLED`, `KAFKA_BROKERS`; recommendation topics `feed.*`, `feature.*`, `rank.*`, `creator.trust.updates`, `content.moderation.updates` + producer `feedEvents.producer.js`; Strimzi CRs `infra/k8s/kafka-topics-recommendation-pipeline.yaml` |
| Kafka | Analytics / abuse | Consumers orchestrated on API boot | `packages/api/src/workers/eventBusOrchestrator.js`, `kafkaAbuseConsumer.js`, `analyticsEventConsumer.js`, etc. |
| Janus | WebRTC | **K8s-deployed Janus SFU** | Live path today is **RTMP ingest → HLS** (`infra/streaming/docker-compose.yml`). Janus is deployed via `infra/k8s/deployment-janus.yaml` (replicas=5) with UDP RTP port `10000` behind a UDP-aware LB and sticky sessions (`sessionAffinity: ClientIP`) so users stay on the same Janus node. |
| Worker | FFmpeg transcoder | **Dockerized** FFmpeg worker next to nginx-rtmp | `infra/streaming/docker-compose.yml` → `ffmpeg-worker`, `scripts/transcode.sh` |
| Worker | Feed ranker | **In-process + library** (not a separate container by default) | `packages/discovery` — `feedGenerator.js`, `rankingEngine.js`; used from API via `@millo/discovery` |
| Worker | Moderation engine | **Workers + Kafka handlers** | `packages/api/src/workers/moderationEventConsumer.js`, `kafkaAbuseHandlers.js`, moderation routes |

---

## Trust & safety stack (summary)

| Area | Implementation notes |
|------|----------------------|
| **AI moderation** | Text / image / video paths (`aiModeration.service`, optional FFmpeg frame extraction); Kafka `content.moderation`; moderation consumer + queue. |
| **Anti-fraud** | `riskEngine`, velocity and gift checks (`fraudService`), chargeback / fraud alerts; Redis keys where configured (`risk:{userId}`, gift velocity). |
| **Trust graph** | `TrustEdge` + workers / admin `GET /admin/risk/:userId` graph field; relationship and ring signals where workers populate edges. |
| **Monetization protection** | Creator trust / authenticity services, monetization gates and abuse patterns in economy + fraud layers. |
| **Enforcement** | `enforcementEngine` (ban / shadow / throttle), Kafka moderation events, discovery shadow-ban ranking. |
| **Real-time risk** | `/user/ws` `suspicious-activity` → Kafka `risk.update`. |

---

## Clean boundaries (microservice-friendly)

1. **API (`packages/api`)** — HTTP + WebSocket (`/live/ws`, `/ws/auction/:id`, `/user/ws`), auth, business rules, publishes to Kafka when enabled.
2. **Streaming stack (`infra/streaming`)** — RTMP/HLS + FFmpeg; owns transcoding pipeline **outside** the Node process.
3. **Data plane** — MongoDB (`@millo/database`), optional Redis for distributed limits.
4. **Event plane** — Kafka (optional); RabbitMQ also supported in config for some paths — see `systemConfigService` / env.
5. **Discovery** — Ranking logic in `packages/discovery`; can be extracted to a dedicated worker later by consuming Kafka topics (pattern not required for current monorepo layout).

---

## Environment variables (minimal checklist)

| Purpose | Typical env |
|---------|-------------|
| API | `MONGODB_URI`, `NODE_ENV`, `CORS_ORIGIN` (default `https://milloapp.com`) |
| Redis (rate limit) | `REDIS_URL` (e.g. after `docker run -d -p 6379:6379 redis`) |
| Redis (feed cache) | `FEED_CACHE_TTL_SEC` (default `60`) — `packages/api/src/server/services/redis.js` (`getFeed`, `rateLimit`) |
| Redis cluster (K8s StatefulSet) | `infra/k8s/service-redis.yaml` + `infra/k8s/redis-statefulset.yaml` (replicas `6`). For this repo’s clients (standalone ioredis), set `REDIS_HOST`/`REDIS_URL` to a single pod for writes, e.g. `redis-0.redis` (headless DNS). Optional auth: set `REDIS_PASSWORD` in `millo-secrets` (container starts with `--requirepass`). |
| Kafka | `KAFKA_ENABLED=true`, `KAFKA_BROKERS=...` (e.g. `localhost:9092`). Official `apache/kafka` images need `KAFKA_ADVERTISED_LISTENERS` for clients outside the container — use your platform’s Kafka guide or Bitnami/Confluent dev compose. |
| Kafka cluster (Strimzi) | `infra/k8s/kafka-strimzi.yaml` — deploy per-region (`us-east`, `eu-west`, `ap-south`). Listener `plain` on `9092` (internal). |
| Cross-region replication | `infra/k8s/kafka-mirrormaker2-us-to-eu.yaml` deployed in EU, and `infra/k8s/kafka-mirrormaker2-eu-to-asia.yaml` deployed in ASIA. Update each `bootstrapServers` value to the reachable Strimzi bootstrap service of the source/target cluster. |
| Kafka feed consumer | `KAFKA_FEED_ENGINE_CONSUMER_ENABLED=true`, optional `KAFKA_FEED_ENGINE_GROUP_ID` (default `feed-group`), topic `video.events` — `packages/api/src/workers/kafkaFeedEngine.worker.js` |
| Kafka discovery ranking | `KAFKA_DISCOVERY_RANKING_ENABLED=true`, optional `KAFKA_DISCOVERY_RANKING_GROUP_ID` (default `millo-discovery-ranking`), topics `video.view` / `video.like` → Redis `discovery:rank:score:*` — `packages/api/src/workers/discoveryKafkaRanking.worker.js`; API publishes from `/content/streams/:id/view`, `/watch`, `/like` |
| Rank training samples | `KAFKA_RANK_TRAINING_SAMPLE_CONSUMER_ENABLED=true`, optional `KAFKA_RANK_TRAINING_SAMPLE_GROUP_ID` (default `rank-training-samples`); consumes `feed.watch` / `feed.engagement` / `feed.negative` → publishes `rank.train.samples` — `packages/api/src/workers/rankTrainingSample.worker.js`, labels in `packages/api/src/lib/rankTrainingLabels.js`; orchestrator consumer name **`rankTrainingSample`** |
| Discovery Redis scores in feed | `@millo/discovery` uses `REDIS_URL` or `REDIS_HOST` for `attachKafkaDiscoveryRankScores` (`packages/discovery/src/redisDiscoveryRank.js`) |
| Enforcement engine | `packages/api/src/services/enforcementEngine.js` — `enforce('BAN'|'SHADOW_BAN'|'THROTTLE', userId, opts)`; throttle TTL default `ENFORCEMENT_THROTTLE_MS` (1h); Kafka `shadow_ban.applied` delegates to `reduceReach` |
| Real-time risk (WebSocket → Kafka) | `GET /user/ws` message `{ type: 'suspicious-activity', data }` → `sendRiskUpdate` / topic `risk.update` with `event: 'risk.update'` (`packages/api/src/routes/userWs.js`, `packages/api/src/server/services/kafka.js`) |
| Admin trust / risk dashboard | `GET /admin/risk/:userId` (alias `GET /dashboards/admin/risk/:userId`) — admin only: Redis key `risk:{userId}` (JSON or string if `REDIS_URL`/`REDIS_HOST`), Mongo `TrustEdge.find({ from })`, plus computed `score`/`signals` from `riskEngine` (`adminTrustRiskService.js`) |
| Kafka producer facade | `packages/api/src/server/services/kafka.js` — `sendEvent`, `sendVideoEvent`, `sendContentModeration` (`content.moderation`) |
| Trust & Safety AI (Phase 3) | `packages/api/src/services/aiModeration.service.js` — `moderateContent`, `evaluateModeration`, `scanVideoFrames` (FFmpeg + Rekognition frames); facade `packages/api/src/server/services/moderation.service.js`; Kafka topic `content.moderation`; consumer `moderationEventConsumer` |
| Anti-fraud (Phase 3) | `packages/api/src/services/riskEngine.js` — `calculateRisk`; Redis `risk:{userId}` (admin dashboard); `fraudService` gift velocity, multi-account, device reuse; `fraudCheck.middleware` (`assertUserRiskAllowed`) on sensitive routes; wired on HTTP + live socket gifts. Env: `FRAUD_RISK_BLOCK_THRESHOLD`, `GIFT_REDIS_SPAM_MAX`, `GIFT_ACCOUNT_AGE_SPIKE_COINS`, `GIFT_ACCOUNT_AGE_SPIKE_HOURS` |
| Device fingerprint (Part 8) | `packages/api/src/lib/deviceFingerprintHash.js` — `hashDeviceFingerprint({ userAgent, ip, screen, timezone })` = SHA-256 of fields joined with Unicode U+241E; `fraudService.recordDevice` derives hash when `fingerprint`/`visitorId` &lt; 8 chars; `POST /fraud/track`, `POST /security/device` → `DeviceFingerprint` collection |
| Trust graph (Mongo, Phase 3) | Schema `TrustEdge` in `@millo/database`; service `packages/api/src/services/trustGraphMongo.service.js` (`recordEdge`, `detectFraudRing`, `syncKafkaEventToMongo`); re-export `packages/api/src/server/models/trustGraph.model.js`. Enable: `TRUST_GRAPH_MONGO_ENABLED=true` — Kafka handlers in `trustGraphWorker` register without Neo4j; complements `NEO4J_URI` graph. Env: `TRUST_GRAPH_FRAUD_RING_MIN_WEIGHT` (default 5). |
| FFmpeg transcode pipeline | `FFMPEG_TRANSCODE_ENABLED=true` (API orchestrator or `node workers/ffmpeg.worker.js`), `FFMPEG_PATH`, `FFMPEG_WORK_DIR`, optional `S3_VOD_BUCKET` + `S3_VOD_PUBLIC_BASE` (or `AWS_S3_BUCKET`) for HLS upload |
| FFmpeg worker cluster (K8s + Kafka lag) | `infra/k8s/deployment-ffmpeg-workers.yaml` (Deployment `ffmpeg-workers`, replicas `10`), and `infra/k8s/keda-ffmpeg-workers-scaledobject.yaml` (KEDA `ScaledObject` scales on Kafka lag for topic `video.uploaded` / group `millo-ffmpeg-transcoder`). Uses image `millo/ffmpeg-kafka-worker:latest` built via `Dockerfile.ffmpeg-kafka-worker`. |
| Kafka VOD topics | `video.uploaded` (producer: `POST /content/streams/:id/recording`), `video.ready` (worker) — see `packages/api/src/services/kafkaEventBus.js` |
| Stripe / payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Streaming | `HLS_HOST`, ingest secrets — see `infra/streaming` |
| CDN (video delivery) | Cloudflare (or CloudFront) in front of `hls.milloapp.com`; cache `.m3u8` and `.ts` at edge (see `infra/cloudflare/cdn-rules.md`). VOD HLS originates from S3 when `S3_VOD_BUCKET` (or `AWS_S3_BUCKET`) is set. |
| Edge moderation (Workers) | Part 8: `infra/cloudflare/workers/edge-moderation.example.js` + `infra/cloudflare/edge-ai-moderation.md` — chat/spam heuristics at edge; bots via `infra/cloudflare-bot-management.md`; heavy AI stays on API (`aiModeration.service`) |
| Global security (Part 9) | `infra/cloudflare/global-security-part9.md` — WAF, DDoS, bot mitigation, edge rate limits (Cloudflare); **`ZERO_TRUST_DEVICE_FINGERPRINT=true`** → API requires Bearer auth + `X-Device-Fingerprint` / `X-Millo-Device-Fingerprint` (`packages/api/src/middleware/zeroTrustDeviceFingerprint.js`; skip list `ZERO_TRUST_SKIP_PREFIXES`) |
| Observability (Part 10) | **`infra/monitoring`** — Docker Compose: Prometheus + Grafana; scrape API `/metrics`; optional **redis_exporter** (`:9121`) and **Kafka exporter** (`:9308`). **App metrics:** `millo_stream_latency_ms`, `millo_active_streams`, `millo_gift_transactions_total` (+ `rate(...)` for per-sec), `millo_redis_cache_*` (feed cache), `millo_process_*` CPU/memory. Dashboard: `grafana/dashboards/millo-observability.json`. See `infra/monitoring/README.md`. |
| Vector retrieval (Part 13) | **`packages/api/src/services/feed/vectorRetrieval.js`** — `nearestContentByUserEmbedding`, `nearestContentForUser`, `registerVectorRetrievalBackend`; env **`VECTOR_RETRIEVAL_BACKEND`** (`none` \| `pgvector` \| `qdrant` \| `milvus` \| `weaviate`). Mongo fallback via `@millo/discovery` `getEmbeddingCandidates`. See **`docs/embedding-and-vector-retrieval.md`**. |

---

## Deploy order (script-driven)

1. Start **MongoDB** + apply migrations / seed as per your ops runbook.  
2. Start **Redis** (recommended production for multi-instance API rate limits).  
3. Start **Kafka** (if using event streaming consumers).  
4. Start **`infra/streaming`** stack for live HLS + FFmpeg.  
5. Start **`packages/api`** then **`packages/web`** (or your reverse proxy to both).

---

## Janus WebRTC (optional, k8s manifests included)

This repo ships Janus gateway container + configs under `infra/janus/` and a K8s deployment/service for scaling under `infra/k8s/deployment-janus.yaml`.

Production expectations:

- **Replicas:** scale to `replicas: 5` (Part 5) for SFU capacity.
- **UDP-aware load balancer:** Janus media transport uses **UDP** (e.g., `10000/udp`), so your cloud LB must support UDP to preserve media flow.
- **Sticky signaling sessions:** WebRTC signaling runs over TCP/WebSocket; the provided Service uses `sessionAffinity: ClientIP` and `externalTrafficPolicy: Local` so the same client IP tends to hit the same Janus node.
- **Join-to-same-node:** for best results, keep the signaling + RTP path consistent; in-cloud UDP LBs typically hash the RTP flow 5-tuple to the same target.

If you later add API-level Janus room signaling (room ↔ stream mapping), document it here so the deploy map stays centralized.

---

*Last aligned with Millo 3.0 monorepo layout. For schema ownership, always use [phase-2-database-schemas.md](./phase-2-database-schemas.md).*
