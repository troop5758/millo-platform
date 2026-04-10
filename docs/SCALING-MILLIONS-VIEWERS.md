# Scaling to Millions of Viewers — Production Architecture

Production architecture for live streams at TikTok-scale: CDN, WebRTC cluster, Realtime Gateway, Redis Cluster, Kafka Event Bus, and microservices. Edge and regional clusters reduce latency and fan-out load. https://milloapp.com

---

## High-Level Stack

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    CDN (Video / HLS)                     │
                    │         CloudFront / Cloudflare / Bunny / Akamai          │
                    └─────────────────────────────┬───────────────────────────┘
                                                  │
                    ┌────────────────────────────▼───────────────────────────┐
                    │              Janus / WebRTC Cluster (SFU)                │
                    │         Low-latency ingest + edge distribution           │
                    └─────────────────────────────┬───────────────────────────┘
                                                  │
                    ┌────────────────────────────▼───────────────────────────┐
                    │                  Realtime Gateway                        │
                    │    WebSocket / SSE; auth; room routing; fan-out          │
                    └─────────────────────────────┬───────────────────────────┘
                                                  │
                    ┌────────────────────────────▼───────────────────────────┐
                    │                    Redis Cluster                         │
                    │   Sessions, leaderboards, rate limits, pub/sub, cache     │
                    └─────────────────────────────┬───────────────────────────┘
                                                  │
                    ┌────────────────────────────▼───────────────────────────┐
                    │                    Kafka Event Bus                      │
                    │   Gift/reaction/chat events; stream lifecycle; audit   │
                    └─────────────────────────────┬───────────────────────────┘
                                                  │
                    ┌────────────────────────────▼───────────────────────────┐
                    │                    Microservices                         │
                    │  API · Economy · Fraud · Notifications · Workers        │
                    └─────────────────────────────────────────────────────────┘
```

---

## 1. CDN (Video)

**Role:** Serve HLS/DASH segments and thumbnails at the edge; absorb video bandwidth and reduce origin load.

| Concern | Recommendation |
|--------|-----------------|
| **Provider** | CloudFront, Cloudflare Stream, Bunny CDN, or Akamai. Millo infra references `cdn.milloapp.com`. |
| **Origin** | Origin pull from transcoder/Janus output or object store (S3/GCS) for VOD. |
| **Live HLS** | Origin can be a small set of packagers; CDN caches `.m3u8` and `.ts` at edge POPs. |
| **Regional** | Use same CDN with regional origins or multi-CDN (e.g. US, EU, APAC) for TikTok-style regional clusters. |

**Millo today:** `stream.playbackUrl` / `recordingUrl` can point to CDN URLs; nginx/cdn.milloapp.com can sit behind a CDN in production.

---

## 2. Janus / WebRTC Cluster

**Role:** Low-latency ingest (RTMP/WebRTC) and distribution via SFU (Selective Forwarding Unit). Scale by adding SFU nodes; use a load balancer in front.

| Concern | Recommendation |
|--------|-----------------|
| **Ingest** | RTMP/WHIP to Janus (or similar); transcoder produces HLS for CDN. |
| **Viewer path** | WebRTC (ultra-low latency) or HLS via CDN (simpler, slightly higher latency). |
| **Scaling** | Per-stream or per-region SFU pools; sticky routing by `streamId` or region. |
| **Edge** | Deploy SFU nodes in multiple regions; route viewers to nearest POP (TikTok-style edge). |

**Millo today:** Phase 4 live uses RTMP + HLS; Janus/WebRTC can replace or complement the current ingest for sub-second latency at scale.

---

## 3. Realtime Gateway

**Role:** WebSocket (and optionally SSE) for chat, reactions, gifts, viewer count. Single place for connection lifecycle, auth, and room routing.

| Concern | Recommendation |
|--------|-----------------|
| **Protocol** | WebSocket (current); optional SSE for simple fallback. |
| **Auth** | Validate token at connect; attach `userId` to socket; reject before joining rooms. |
| **Rooms** | One room per `streamId` (and per event/auction/meeting). Room state can live in Redis. |
| **Fan-out** | On event (gift_sent, reaction_burst, chat): read room member list from Redis or in-memory set; broadcast to local connections; use Redis Pub/Sub to fan out to other gateway nodes. |
| **Scaling** | Stateless gateway nodes behind a load balancer; Redis Pub/Sub (or Kafka) for cross-node broadcast. |

**Millo today:** `liveChat.socket` (rooms, broadcast); WebSocket at `/live/ws?streamId=`. For millions, split: many gateway instances + Redis Pub/Sub so “broadcast to stream X” is published once and each gateway pushes to its local subscribers.

---

## 4. Redis Cluster

**Role:** Shared state and coordination across API, gateway, and workers.

| Use case | Key pattern / command | Notes |
|----------|------------------------|--------|
| **Sessions / presence** | `live:viewers:{streamId}`, `live:room:{streamId}:sockets` | Per-stream viewer set or count. |
| **Gift leaderboard** | `live:gift:leaderboard:{streamId}` (ZSET) | ZINCRBY on gift; ZREVRANGE for top. |
| **Reaction aggregation** | `live:reactions:{streamId}` (HASH) | HINCRBY per emoji; burst job reads deltas. |
| **Rate limits** | `reaction_rate:{userId}:{sec}` | Token bucket / INCR for reactions, gifts. |
| **Pub/Sub** | `channel:stream:{streamId}` | Gateway subscribes; API/workers publish gift_sent, reaction_burst, chat. |
| **Cache** | Config, pricing, hot profile data | Reduce DB load. |

**Scaling:** Use Redis Cluster (sharding) or Redis Enterprise for high throughput and memory. Realtime Gateway and API connect to the same cluster so leaderboards, rate limits, and pub/sub are consistent.

---

## 5. Kafka Event Bus

**Role:** Decouple producers (API, gateway) from consumers (workers, analytics, audit, push).

| Topic (example) | Producer | Consumers |
|------------------|----------|-----------|
| `live.gifts` | API after debit/credit | Fraud worker, analytics, notifications |
| `live.reactions` | Gateway or aggregation job | Analytics, reaction_burst processor |
| `live.chat` | Gateway on chat message | Moderation, analytics, audit |
| `live.stream.lifecycle` | API (start/end stream) | CDN/Janus control, analytics, billing |
| `audit.financial` | Economy / API | Audit log, compliance |

**Benefits:** Backpressure, replay, multiple consumers per topic; fits TikTok-style event-driven pipelines and regional consumers (e.g. EU Kafka cluster for EU events).

**Millo today:** Workers and in-process handlers can be migrated to Kafka consumers so API stays thin and scaling is per-consumer.

---

## 6. Microservices

**Role:** Separate domains so each can scale and deploy independently.

| Service | Responsibility | Scale lever |
|---------|----------------|-------------|
| **API** | REST + WebSocket registration; auth; orchestration | Horizontal; stateless behind LB. |
| **Realtime Gateway** | WebSocket connections; room join/leave; broadcast | Horizontal; scale with viewer count. |
| **Economy** | Ledger, debit/credit, gifts, payouts | DB + Redis; optional read replicas. |
| **Fraud** | Velocity, device graph, risk scores | Async via Kafka; scale workers. |
| **Notifications** | Push, email, in-app | Queue-driven; scale workers. |
| **Transcoder / Janus** | Ingest + SFU | Scale with concurrent streams. |

**Millo today:** Monorepo packages (`api`, `economy`, `workers`, etc.) map to deployable units; splitting API and Gateway into two deployables is a natural next step for millions of viewers.

---

## Edge and Regional Clusters (TikTok-Style)

| Layer | Edge / Regional strategy |
|-------|---------------------------|
| **CDN** | Same CDN, multiple origins or multi-CDN; route by user region. |
| **WebRTC / SFU** | SFU pools per region (e.g. us-east, eu-west, ap-south); DNS or Anycast to nearest. |
| **Realtime Gateway** | Deploy gateway nodes in same regions as SFU; users connect to regional endpoint; Redis/Kafka can be regional with optional global replication. |
| **API** | Global LB with geo routing; or regional API clusters talking to shared DB (with replication) and regional Redis/Kafka. |
| **Data** | MongoDB/Postgres: primary in one region, read replicas in others; Redis Cluster can be multi-AZ then multi-region; Kafka: one cluster per region or replicated clusters. |

---

## Millo Mapping (Current → Scale)

| Current | At scale |
|--------|----------|
| Single API process, in-process WebSocket | API (REST + auth) + Realtime Gateway (WebSocket) behind LB |
| Single Redis | Redis Cluster; same key patterns (leaderboard, reactions, rate limit, pub/sub) |
| No Kafka | Kafka for gifts, reactions, chat, stream lifecycle, audit |
| HLS from single origin | CDN in front of HLS origin; optional Janus/WebRTC for low latency |
| PM2 on one server | Kubernetes or multi-node PM2; gateway and API scale out independently |

---

## Checklist for Production at Scale

- [ ] **CDN** in front of video (HLS) and static assets; `cdn.milloapp.com` origin.
- [ ] **Redis Cluster** (or Redis Enterprise) for leaderboards, reactions, rate limits, pub/sub.
- [ ] **Realtime Gateway** separated from API; subscribes to Redis Pub/Sub for cross-node broadcast.
- [ ] **Kafka** for gift, reaction, chat, and stream-lifecycle events; workers consume from Kafka.
- [ ] **Janus or WebRTC cluster** for low-latency live when required.
- [ ] **Regional** deployment for gateway and SFU (and optionally API) with geo routing.
- [ ] **Monitoring** (Prometheus/Grafana/Sentry) and alerting on gateway connections, Redis/Kafka lag, and error rates.

---

*This doc is the reference for scaling Millo live to millions of viewers; implement in phases (e.g. Redis Cluster + Gateway separation first, then Kafka, then edge).*
