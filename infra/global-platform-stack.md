# Global platform stack

**Production:** https://milloapp.com

End-to-end path from users to durable storage:

```
Users (Global)
   ↓
CDN + Edge (Cloudflare / Fastly)
   ↓
Global Load Balancer (Geo DNS)
   ↓
Kubernetes Clusters (Multi-Region)
   ↓
Microservices (API, Web, Workers)
   ↓
Kafka (multi-cluster)
   ↓
Databases (replicated)
   ↓
S3 (multi-region)
```

## Layer notes (this repository)

| Layer | Role | Pointers |
|-------|------|----------|
| **CDN + Edge** | Static assets, TLS, WAF, HLS/video, **Workers** (moderation / routing) | `infra/cloudflare/cdn-rules.md`, `infra/cdn-video-delivery.md`, **`infra/cloudflare/edge-ai-low-latency.md`**, Fastly/CloudFront analogous |
| **Geo DNS / GLB** | Nearest region + failover for `api.milloapp.com` | `infra/multi-region-geo-routing.md` |
| **Kubernetes** | Regional clusters, Deployments, **Ingress (L7)**, **HPA / KEDA** | **`infra/global-load-balancing.md`**, **`infra/auto-scaling-strategy.md`**, `infra/k8s/` |
| **Microservices** | API (Fastify), Web SPA, BullMQ/Kafka workers | `packages/api`, `packages/web`, `packages/workers` |
| **Kafka** | Event backbone; **multi-cluster + MM2** | **`infra/kafka-multi-cluster.md`**, `packages/api/src/services/kafkaEventBus.js`, `infra/k8s/kafka-strimzi.yaml`, `kafka-mirrormaker2-*.yaml` |
| **Databases** | Primary + global read replicas; consistency by design | **`infra/global-database-strategy.md`**, `docs/phase-2-database-schemas.md`, `infra/provision-mongodb.sh`, optional Postgres ledger per `docs/data-storage-layer.md` |
| **Live ingest (pro)** | OBS → **RTMP** (nginx-rtmp) → HLS / workers | **`infra/obs-rtmp-ingest-pro.md`**, `infra/rtmp-obs.md`, `infra/streaming/nginx.conf` |
| **S3** | Media, recordings, VOD artifacts | API `packages/api/src/lib/s3.js`, worker pipelines, CDN origins |

This diagram is the **external traffic and data plane** view; for the in-cluster service diagram see `docs/architecture-infrastructure-stack.md`.

**Load testing (k6, Locust — 10k viewers / 1k streams patterns):** `infra/load-testing.md`

**Global security (WAF, rate limits, bots, final checklist):** `infra/global-security.md`

**Discovery feed pipeline (user actions → Kafka → rank → `/feed` → client):** `docs/feed-pipeline-user-actions-to-client.md`
