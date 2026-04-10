# Kafka multi-cluster (cross-region)

**Production platform:** https://milloapp.com  
Kafka is **internal** to the platform; apps use `KAFKA_BROKERS` / `KAFKA_BROKER` (see `packages/api/src/services/kafkaEventBus.js`).

## Why Apache Kafka

| Role | Benefit |
|------|---------|
| **Event backbone** | Durable log for payments, live events, moderation, analytics, fan-out to workers without coupling producers to every consumer. |
| **Scale** | Partitioned topics; consumer groups scale horizontally per region. |
| **Replay** | New consumers can read history (retention permitting) for backfill and recovery. |

Kafka **does not replace** your primary database; it complements **MongoDB/Postgres** for **async workflows** and **regional read scaling** patterns.

---

## Setup pattern

1. **One Kafka cluster per region** (isolated brokers, local producers/consumers for low latency).
2. **MirrorMaker 2 (MM2)** between clusters to **replicate topics** (and optionally consumer offsets — tuned per manifest).
3. **Topic naming** stays consistent across regions so mirrored topics are predictable (`live_events`, `payments`, etc. — see `TOPICS` in `kafkaEventBus.js`).

**Strimzi** manifests in this repo:

| File | Purpose |
|------|---------|
| `infra/k8s/kafka-strimzi.yaml` | `Kafka` CR — deploy **once per regional** K8s cluster (3 Kafka + 3 ZK replicas in example). |
| `infra/k8s/kafka-mirrormaker2-us-to-eu.yaml` | MM2: **US → EU** (run MM2 in **EU** cluster; source = US bootstrap, target = EU bootstrap). |
| `infra/k8s/kafka-mirrormaker2-eu-to-asia.yaml` | MM2: **EU → Asia** (run MM2 in **Asia** cluster; source = EU bootstrap, target = Asia bootstrap). |
| `infra/k8s/kafka-topics-recommendation-pipeline.yaml` | Example topic CRs for discovery / ranking pipeline. |

**Before apply:** replace placeholder bootstrap hostnames (`us-kafka-bootstrap`, `eu-kafka-bootstrap`, `asia-kafka-bootstrap`) with your real Strimzi **bootstrap** Services (or DNS).

---

## Example topology: US → EU → Asia

```
┌─────────────┐     MirrorMaker2      ┌─────────────┐     MirrorMaker2      ┌─────────────┐
│  US Kafka   │  ──────────────────►  │  EU Kafka   │  ──────────────────►  │ Asia Kafka  │
│  (primary   │   (deploy MM2 in EU)   │             │   (deploy MM2 in ASIA)│             │
│   region)   │                        │             │                        │             │
└─────────────┘                        └─────────────┘                        └─────────────┘
       ▲                                      ▲                                      ▲
       │                                      │                                      │
   US producers/                           EU producers/                         Asia producers/
   consumers                               consumers                             consumers
```

- **Local traffic** stays on the **local cluster** (fast path).
- **Mirrored topics** let downstream regions observe **global** event streams with **replication lag** (seconds typical; tune bandwidth and MM2).
- A **chain** (US→EU→Asia) means Asia consumers of **EU-mirrored** topics see US-originated events **after** US→EU lag **plus** EU→Asia lag. For **lower Asia latency from US**, add a **direct** US→Asia MM2 or accept chain latency.

---

## Operations notes

- **Consumer groups:** same `group.id` in two regions on the **same** logical topic can **double-process** unless topics are **region-scoped** or consumers are **idempotent** and designed for multi-site. Often: **one active consumer group per region** on **local** topics, and **read replicas** of global topics only where needed.
- **Exactly-once** across regions is **not** automatic; design for **at-least-once** + idempotency keys where money or inventory is involved.
- **TLS / SASL:** enable in production Strimzi listeners; examples use `plain` for lab clarity.
- **Monitoring:** lag per MM2 connector, broker disk, under-replicated partitions.

---

## Related

| Doc / code | Topic |
|------------|--------|
| `infra/global-platform-stack.md` | Full stack diagram |
| `infra/global-database-strategy.md` | DB primary/replica vs Kafka |
| `docs/event-bus-architecture.md` | Event bus concepts (if present) |
| `packages/api/src/workers/eventBusOrchestrator.js` | API-side consumers |
