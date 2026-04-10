# Millo Platform Scale Target

Enterprise-grade architecture designed for massive scale: 100M users, 10M DAU, 1M concurrent livestream viewers, and 500K creators.

## Scale Targets

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PLATFORM SCALE TARGETS                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────────┬────────────────┬────────────────┬────────────────┐
│   100M Users   │   10M DAU      │   1M Concurrent│   500K Creators│
│   (Total)      │   (Daily)      │   (Live)       │   (Active)     │
└────────────────┴────────────────┴────────────────┴────────────────┘

Key Metrics:
• 100,000,000  Total registered users
• 10,000,000   Daily active users
• 1,000,000    Concurrent livestream viewers
• 500,000      Active creators
• 50,000       Concurrent live streams
• 1,000,000    API requests/second (peak)
• 10 PB        Monthly data transfer
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PRODUCTION ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │   Global Users  │
                         │   (100M)        │
                         └────────┬────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE EDGE (300+ PoPs)                            │
│  • DDoS Protection  • WAF  • CDN  • Rate Limiting  • Bot Management        │
│  Capacity: 100+ Tbps                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   US Region     │    │   EU Region     │    │   APAC Region   │
│   (Primary)     │    │   (Secondary)   │    │   (Secondary)   │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KUBERNETES CLUSTERS                                 │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐   │
│  │ API Pods    │ Worker Pods │ WebSocket   │ Streaming   │ AI Pods     │   │
│  │ (200+)      │ (100+)      │ Pods (50+)  │ Pods (100+) │ (50+)       │   │
│  │ Auto-scale  │ Auto-scale  │ Auto-scale  │ Auto-scale  │ Auto-scale  │   │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MongoDB       │    │   Redis         │    │   Kafka         │
│   Cluster       │    │   Cluster       │    │   Cluster       │
│   (Sharded)     │    │   (Sentinel)    │    │   (Multi-Broker)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 1. API Layer Scaling

### Horizontal Scaling Strategy

| Component | Instances | Capacity | Auto-Scale Trigger |
|-----------|-----------|----------|-------------------|
| API Servers | 200+ | 5K RPS each | CPU > 70% |
| WebSocket Servers | 50+ | 20K connections each | Memory > 80% |
| Worker Pods | 100+ | 1K jobs/min each | Queue depth > 1000 |
| Streaming Pods | 100+ | 500 streams each | Viewer count |

### Kubernetes Deployment

```yaml
# api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: millo-api
spec:
  replicas: 50  # Base replicas
  selector:
    matchLabels:
      app: millo-api
  template:
    spec:
      containers:
      - name: api
        image: millo/api:latest
        resources:
          requests:
            cpu: "500m"
            memory: "512Mi"
          limits:
            cpu: "2000m"
            memory: "2Gi"
        ports:
        - containerPort: 3000
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 15
          periodSeconds: 20
---
# Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: millo-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: millo-api
  minReplicas: 50
  maxReplicas: 300
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Load Balancer Configuration

```
                    ┌─────────────────┐
                    │   Cloudflare    │
                    │   Load Balancer │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   API Pod   │      │   API Pod   │      │   API Pod   │
│   (us-1)    │      │   (us-2)    │      │   (us-N)    │
└─────────────┘      └─────────────┘      └─────────────┘
```

---

## 2. Database Scaling

### MongoDB Sharded Cluster

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     MONGODB SHARDED CLUSTER                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Config Server │    │   Config Server │    │   Config Server │
│   (Primary)     │    │   (Secondary)   │    │   (Secondary)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   mongos        │    │   mongos        │    │   mongos        │
│   (Router)      │    │   (Router)      │    │   (Router)      │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
    ┌───────────────────────────┼───────────────────────────┐
    │                           │                           │
    ▼                           ▼                           ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Shard 1       │    │   Shard 2       │    │   Shard N       │
│   (Replica Set) │    │   (Replica Set) │    │   (Replica Set) │
│   Users A-M     │    │   Users N-Z     │    │   Overflow      │
│   3x replicas   │    │   3x replicas   │    │   3x replicas   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Sharding Strategy

| Collection | Shard Key | Distribution |
|------------|-----------|--------------|
| `users` | `{ _id: 'hashed' }` | Even distribution |
| `sessions` | `{ userId: 1 }` | User affinity |
| `live_streams` | `{ createdAt: 1 }` | Time-based |
| `ledger_entries` | `{ actorId: 'hashed' }` | User affinity |
| `messages` | `{ roomId: 1, createdAt: 1 }` | Room + time |

### Read Replicas

```javascript
// MongoDB connection with read preference
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
  readPreference: 'secondaryPreferred',
  readConcern: { level: 'majority' },
  writeConcern: { w: 'majority', j: true },
  maxPoolSize: 100,
  minPoolSize: 10,
});
```

### Database Capacity

| Metric | Target | Strategy |
|--------|--------|----------|
| Storage | 50+ TB | Sharding + compression |
| Connections | 50,000+ | Connection pooling |
| IOPS | 500,000+ | NVMe + provisioned IOPS |
| Queries/sec | 1,000,000+ | Read replicas + caching |

---

## 3. Redis Cluster Scaling

### Redis Cluster Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REDIS CLUSTER (Sentinel)                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Sentinel 1    │    │   Sentinel 2    │    │   Sentinel 3    │
│   (Monitor)     │    │   (Monitor)     │    │   (Monitor)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redis Master  │───▶│   Redis Slave   │───▶│   Redis Slave   │
│   (Write)       │    │   (Read)        │    │   (Read)        │
│   Slot 0-5460   │    │   Replica       │    │   Replica       │
└─────────────────┘    └─────────────────┘    └─────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redis Master  │───▶│   Redis Slave   │───▶│   Redis Slave   │
│   (Write)       │    │   (Read)        │    │   (Read)        │
│   Slot 5461-10922│   │   Replica       │    │   Replica       │
└─────────────────┘    └─────────────────┘    └─────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redis Master  │───▶│   Redis Slave   │───▶│   Redis Slave   │
│   (Write)       │    │   (Read)        │    │   (Read)        │
│   Slot 10923-16383│  │   Replica       │    │   Replica       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Redis Use Cases

| Use Case | Key Pattern | Capacity |
|----------|-------------|----------|
| Sessions | `session:{userId}` | 10M active |
| Rate Limits | `rate_limit:{ip}:{endpoint}` | 100M keys |
| Live Viewers | `live:viewers:{streamId}` | 50K streams |
| Gift Leaderboards | `live:gift:leaderboard:{streamId}` | 50K ZSETs |
| Trending Sounds | `trending_sounds` | 10K ZSETs |
| Distributed Locks | `lock:ledger:{userId}` | 1M locks/min |

### Redis Configuration

```bash
# Production Redis cluster config
maxmemory 64gb
maxmemory-policy allkeys-lru
cluster-enabled yes
cluster-node-timeout 5000
cluster-replica-validity-factor 0
tcp-keepalive 60
```

---

## 4. Event Bus Scaling (Kafka)

### Kafka Cluster Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KAFKA CLUSTER                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Broker 1   │ │ Broker 2   │ │ Broker 3   │ │ Broker 4   │ │ Broker 5   │
│ (Leader)   │ │ (Replica)  │ │ (Replica)  │ │ (Leader)   │ │ (Replica)  │
└────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘

Topics:
┌───────────────────────────────────────────────────────────────────────────┐
│ payments        │ 32 partitions │ RF: 3 │ 500K events/sec              │
│ live_events     │ 64 partitions │ RF: 3 │ 2M events/sec                │
│ moderation      │ 16 partitions │ RF: 3 │ 100K events/sec              │
│ notifications   │ 32 partitions │ RF: 3 │ 1M events/sec                │
│ analytics       │ 64 partitions │ RF: 3 │ 5M events/sec                │
│ fraud           │ 16 partitions │ RF: 3 │ 100K events/sec              │
│ user_activity   │ 64 partitions │ RF: 3 │ 10M events/sec               │
│ auth_events     │ 16 partitions │ RF: 3 │ 500K events/sec              │
└───────────────────────────────────────────────────────────────────────────┘
```

### Kafka Configuration

```javascript
// packages/api/src/services/kafkaEventBus.js
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'millo-api',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
  connectionTimeout: 3000,
  requestTimeout: 30000,
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000,
  maxInFlightRequests: 5,
  idempotent: true,
});
```

### Event Throughput

| Topic | Events/sec | Partitions | Consumers |
|-------|------------|------------|-----------|
| `user_activity` | 10M | 64 | 32 |
| `analytics` | 5M | 64 | 16 |
| `live_events` | 2M | 64 | 32 |
| `notifications` | 1M | 32 | 16 |
| `payments` | 500K | 32 | 8 |

---

## 5. Worker Queue Scaling (BullMQ)

### Queue Architecture

```javascript
// packages/workers/src/queues.js
const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
};

// High-throughput queues
const compositionQueue = new Queue('composition', { connection });
const trendingSoundsQueue = new Queue('trending-sounds', { connection });
const fraudCheckQueue = new Queue('fraud-check', { connection });
const liveEventsQueue = new Queue('live-events', { connection });
const earlyViralDetectionQueue = new Queue('early-viral-detection', { connection });
const clusterPropagationQueue = new Queue('cluster-propagation', { connection });
```

### Worker Scaling

| Queue | Workers | Jobs/min | Priority |
|-------|---------|----------|----------|
| `composition` | 50 | 10K | High |
| `trending-sounds` | 20 | 50K | Medium |
| `fraud-check` | 30 | 100K | Critical |
| `live-events` | 40 | 500K | High |
| `payout-retry` | 10 | 5K | High |

---

## 6. Live Streaming Scale

### Streaming Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LIVE STREAMING INFRASTRUCTURE                            │
│                    Target: 1M Concurrent Viewers                            │
└─────────────────────────────────────────────────────────────────────────────┘

Creators (50K concurrent streams)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      RTMP INGEST CLUSTER                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   NGINX     │ │   NGINX     │ │   NGINX     │ │   NGINX     │           │
│  │   RTMP 1    │ │   RTMP 2    │ │   RTMP 3    │ │   RTMP N    │           │
│  │   (10K)     │ │   (10K)     │ │   (10K)     │ │   (10K)     │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FFMPEG TRANSCODING CLUSTER                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   FFmpeg    │ │   FFmpeg    │ │   FFmpeg    │ │   FFmpeg    │           │
│  │   Worker 1  │ │   Worker 2  │ │   Worker 3  │ │   Worker N  │           │
│  │   (5K)      │ │   (5K)      │ │   (5K)      │ │   (5K)      │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CDN EDGE (Cloudflare)                                  │
│                      1M+ Concurrent Viewers                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Edge PoP  │ │   Edge PoP  │ │   Edge PoP  │ │   Edge PoP  │           │
│  │   US-East   │ │   EU-West   │ │   Asia-Pac  │ │   S-America │           │
│  │   (250K)    │ │   (250K)    │ │   (250K)    │ │   (250K)    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Streaming Capacity

| Component | Capacity | Scale |
|-----------|----------|-------|
| RTMP Ingest | 50K concurrent | 5 nodes |
| Transcoding | 50K streams | 100 FFmpeg pods |
| HLS Delivery | 1M viewers | CDN edge |
| WebSocket Chat | 1M connections | 50 pods |

---

## 7. Storage Scale

### Object Storage Capacity

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OBJECT STORAGE                                       │
└─────────────────────────────────────────────────────────────────────────────┘

                    Total: 10 PB Monthly Transfer
                           5 PB Storage

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Videos        │    │   Thumbnails    │    │   Music         │
│   4 PB          │    │   500 TB        │    │   500 TB        │
│   100M files    │    │   500M files    │    │   10M files     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Storage Providers

| Provider | Use Case | Capacity |
|----------|----------|----------|
| Cloudflare R2 | Primary (zero egress) | 3 PB |
| AWS S3 | Backup + Archives | 2 PB |
| Google Cloud Storage | Transcoding temp | 500 TB |

---

## 8. Creator Economy Scale

### Financial Throughput

| Metric | Target | Peak |
|--------|--------|------|
| Daily Transactions | 10M | 50M |
| Gift Transactions | 5M/day | 25M/day |
| Subscriptions | 2M active | N/A |
| Monthly Payouts | 500K | 750K |
| GMV | $100M/month | $200M |

### Payment Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PAYMENT PROCESSING CAPACITY                             │
└─────────────────────────────────────────────────────────────────────────────┘

Transactions Per Second:
• Stripe:    10,000 TPS
• PayPal:    5,000 TPS
• Internal:  100,000 TPS (coin transfers)

Ledger Writes:
• MongoDB:   500,000 writes/sec (sharded)
• Redis:     1,000,000 ops/sec (ledger locks)
```

---

## 9. Regional Deployment

### Multi-Region Architecture

| Region | Primary Services | Capacity |
|--------|-----------------|----------|
| US-East (Virginia) | All services | 50% traffic |
| EU-West (Ireland) | API, Workers, DB replica | 25% traffic |
| AP-Southeast (Singapore) | API, Workers, DB replica | 20% traffic |
| SA-East (São Paulo) | CDN edge, API | 5% traffic |

### Failover Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FAILOVER ARCHITECTURE                               │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   Cloudflare    │
                    │   Global LB     │
                    │   (Health Checks)│
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   US-East       │ │   EU-West       │ │   AP-Southeast  │
│   (Primary)     │ │   (Secondary)   │ │   (Secondary)   │
│   ● Active      │ │   ○ Standby     │ │   ○ Standby     │
└─────────────────┘ └─────────────────┘ └─────────────────┘

Failover Time: < 30 seconds
RTO: 5 minutes
RPO: 0 (synchronous replication)
```

---

## 10. Monitoring at Scale

### Observability Stack

| Component | Purpose | Retention |
|-----------|---------|-----------|
| Prometheus | Metrics | 30 days |
| Grafana | Dashboards | N/A |
| Loki | Logs | 7 days |
| Sentry | Errors | 90 days |
| Jaeger | Traces | 7 days |

### Key Metrics

```yaml
# Alert thresholds for scale
alerts:
  - name: HighAPILatency
    expr: histogram_quantile(0.95, http_request_duration_seconds) > 0.5
    for: 5m
    
  - name: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
    for: 5m
    
  - name: QueueBacklog
    expr: bullmq_queue_waiting > 10000
    for: 10m
    
  - name: DatabaseConnections
    expr: mongodb_connections_current > 40000
    for: 5m
```

---

## 11. Cost Optimization

### Infrastructure Costs (Monthly Estimate)

| Component | Cost | Notes |
|-----------|------|-------|
| Kubernetes (500 pods) | $50,000 | Auto-scaling |
| MongoDB Atlas (Sharded) | $30,000 | Dedicated cluster |
| Redis Enterprise | $15,000 | Cluster mode |
| Kafka (Confluent Cloud) | $20,000 | 10M events/sec |
| CDN (Cloudflare Enterprise) | $25,000 | 10 PB transfer |
| Object Storage (R2 + S3) | $15,000 | 5 PB storage |
| Monitoring (Datadog) | $10,000 | Full stack |
| **Total** | **~$165,000/month** | |

### Cost per User

| Metric | Value |
|--------|-------|
| Cost per MAU | $0.00165 |
| Cost per DAU | $0.0165 |
| Cost per transaction | $0.0005 |

---

## Summary

### Scale Targets Achieved

| Target | Architecture Support |
|--------|---------------------|
| 100M Users | Sharded MongoDB, CDN |
| 10M DAU | 200+ API pods, Redis cluster |
| 1M Concurrent Live Viewers | CDN edge + regional ingest |
| 500K Creators | Distributed ledger, Kafka |
| 1M RPS | Horizontal scaling, load balancing |

### Key Technologies

| Layer | Technology | Scale Feature |
|-------|------------|---------------|
| Edge | Cloudflare | 100+ Tbps, 300+ PoPs |
| Compute | Kubernetes | Auto-scaling pods |
| Database | MongoDB | Sharding, replicas |
| Cache | Redis | Cluster mode |
| Events | Kafka | Partitioned topics |
| Storage | R2/S3 | Unlimited capacity |
| Streaming | NGINX-RTMP + CDN | Edge delivery |
