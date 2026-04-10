# Millo Observability Stack

Comprehensive monitoring, logging, and alerting infrastructure.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OBSERVABILITY STACK                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                              APPLICATION
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│   API      │ │  Workers   │ │   Live     │ │  Payments  │ │  Content   │
│  Service   │ │  (BullMQ)  │ │  Streaming │ │  Service   │ │  Service   │
└─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
      │              │              │              │              │
      └──────────────┼──────────────┼──────────────┼──────────────┘
                     │              │              │
         ┌───────────┴───────────┬──┴──────────────┴───────────┐
         │                       │                             │
         ▼                       ▼                             ▼
┌─────────────────┐    ┌─────────────────┐           ┌─────────────────┐
│   Prometheus    │    │     Sentry      │           │      Logs       │
│   /metrics      │    │  Error Tracking │           │   (Loki/ELK)    │
└────────┬────────┘    └────────┬────────┘           └────────┬────────┘
         │                      │                             │
         ▼                      ▼                             ▼
┌─────────────────┐    ┌─────────────────┐           ┌─────────────────┐
│    Grafana      │    │  Sentry Web UI  │           │  Grafana Loki   │
│   Dashboards    │    │   Alerts        │           │    Explorer     │
└─────────────────┘    └─────────────────┘           └─────────────────┘
```

---

## 1. Prometheus Metrics

### Configuration

File: `packages/api/src/routes/metrics.js`

```javascript
const client = require('prom-client');

// Collect Node.js default metrics (CPU, memory, event loop)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix: 'millo_' });
```

### Metrics Defined

#### HTTP Request Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `millo_http_requests_total` | Counter | method, route, status | Total HTTP requests |
| `millo_http_request_duration_seconds` | Histogram | method, route, status | Request latency |
| `millo_payment_errors_total` | Counter | route, status | Payment endpoint errors |

```javascript
const httpRequestsTotal = new client.Counter({
  name: 'millo_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const httpRequestDuration = new client.Histogram({
  name: 'millo_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
```

#### Queue Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `millo_queue_depth` | Gauge | queue, state | Jobs by queue and state |
| `millo_worker_failures` | Gauge | queue | Failed jobs count |

```javascript
const queueDepth = new client.Gauge({
  name: 'millo_queue_depth',
  help: 'Queue depth by queue and state',
  labelNames: ['queue', 'state'],
});

// Queues monitored
const QUEUE_NAMES = [
  'trust-decay', 'payout-retry', 'payment-deadline',
  'scheduled-streams', 'stream-reminder', 'live-events',
  'dm-timeout', 'fraud-check', 'bot-detection', 'composition',
];
```

### Metrics Endpoint

```
GET /metrics

# Response: Prometheus text format
# HELP millo_http_requests_total Total HTTP requests
# TYPE millo_http_requests_total counter
millo_http_requests_total{method="GET",route="/content/streams",status="200"} 1523
millo_http_requests_total{method="POST",route="/payments/coin-checkout",status="200"} 89
...
```

---

## 2. Grafana Dashboards

### Infrastructure

File: `infra/monitoring/docker-compose.yml`

```yaml
services:
  prometheus:
    image: prom/prometheus:v2.47.0
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./alerts.yml:/etc/prometheus/alerts.yml:ro

  grafana:
    image: grafana/grafana:10.2.0
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_INSTALL_PLUGINS=grafana-piechart-panel
```

### Prometheus Configuration

File: `infra/monitoring/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'millo-api'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: /metrics
    scrape_interval: 10s
```

### Recommended Dashboards

| Dashboard | Metrics | Purpose |
|-----------|---------|---------|
| API Overview | http_requests_total, request_duration | Traffic & latency |
| Queue Health | queue_depth, worker_failures | Job processing |
| Payment Metrics | payment_errors_total | Revenue monitoring |
| System Health | process_cpu, memory, heap | Node.js health |

---

## 3. Alerting

### Alert Rules

File: `infra/monitoring/alerts.yml`

```yaml
groups:
  - name: millo_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(millo_http_requests_total{status=~"5.."}[5m]) > 5
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate on Millo API"

      - alert: SlowAPI
        expr: histogram_quantile(0.95, rate(millo_http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "95th percentile latency > 2s"

      - alert: APIDown
        expr: up{job="millo-api"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Millo API is down"

      - alert: HighMemoryUsage
        expr: process_resident_memory_bytes / 1024 / 1024 > 512
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Process memory > 512MB"
```

---

## 4. Sentry Error Tracking

### Configuration

File: `packages/api/src/index.js`

```javascript
if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    release: process.env.APP_VERSION || '3.0.0',
    tracesSampleRate: 0.05, // 5% of transactions
    beforeSend(event) {
      // Strip sensitive headers
      if (event.request?.headers) {
        if (event.request.headers.authorization)
          event.request.headers.authorization = '[Filtered]';
        if (event.request.headers.cookie)
          event.request.headers.cookie = '[Filtered]';
      }
      return event;
    },
  });
  global.__sentry = Sentry;
}
```

### Features
- **Error Tracking** — Automatic exception capture
- **Performance** — Transaction tracing (5% sample)
- **Releases** — Version tracking via `APP_VERSION`
- **Environments** — Separate dev/staging/production

---

## 5. Health Checks

### Health Dashboard Service

File: `packages/api/src/services/healthDashboard.js`

```javascript
async function getHealthDashboard() {
  const [database, redis, kafka, storage, aiServices, economy, notifications] = 
    await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkKafka(),
      checkStorage(),
      checkAIServices(),
      checkEconomy(),
      checkNotifications(),
    ]);

  const criticalOk = database.status === 'ok' && redis.status === 'ok';
  return { healthy: criticalOk, checks: { ... } };
}
```

### Health Checks

| Check | Critical | Status Values |
|-------|----------|---------------|
| Database (MongoDB) | Yes | ok, error |
| Redis | Yes | ok, error |
| Kafka | No | ok, disabled, error |
| Storage (S3/R2) | No | ok, not_configured |
| AI Services | No | ok, not_configured |
| Economy | No | ok, unavailable |
| Notifications | No | ok, misconfigured |

### API Endpoint

```
GET /health

{
  "healthy": true,
  "checks": {
    "database": { "status": "ok" },
    "redis": { "status": "ok" },
    "kafka": { "status": "ok", "brokers": 3 },
    "storage": { "status": "ok", "backend": "s3" },
    "ai_services": { "status": "ok", "openai": "configured" },
    "economy": { "status": "ok" },
    "notifications": { "status": "ok" }
  },
  "criticalOk": true
}
```

---

## 6. Self-Observation API

### Endpoints

File: `packages/api/src/routes/observation.js`

| Endpoint | Purpose |
|----------|---------|
| `GET /observation/recommendations` | System recommendations |
| `GET /observation/drift` | Configuration drift detection |
| `GET /observation/upgrade` | Dependency upgrade advisories |
| `GET /observation/health` | Health summary |
| `GET /observation/security` | Security alerts |
| `GET /observation/queues` | Queue statistics |
| `GET /workers/metrics` | Worker job metrics |

### Queue Dashboard

```javascript
async function getQueueDashboard() {
  const queues = getQueues();
  const result = [];
  for (const q of queues) {
    const counts = await q.getJobCounts(
      'waiting', 'active', 'delayed', 
      'failed', 'completed', 'paused'
    );
    result.push({ name: q.name, ...counts });
  }
  return result;
}
```

---

## 7. Business Analytics

### Analytics Service

File: `packages/api/src/services/analyticsService.js`

### Metrics Tracked

| Metric | Description | Calculation |
|--------|-------------|-------------|
| DAU | Daily Active Users | Distinct users with session in 24h |
| MAU | Monthly Active Users | Distinct users with session in 30d |
| Creator Revenue | Creator earnings (cents) | Sum of creator LedgerEntry credits |
| ARPU | Average Revenue Per User | Platform revenue / MAU |
| Retention | Week-over-week retention | Users active both weeks / previous week |
| Conversion | Signup to purchase | Users with purchase / signups (30d) |

```javascript
async function getCurrentMetrics() {
  const [dau, mau, creatorRevenue, arpu, retention, conversion] = 
    await Promise.all([
      getDAU(),
      getMAU(),
      getCreatorRevenueCents(),
      getARPU(),
      getRetentionPct(),
      getConversionPct(),
    ]);
  return { dau, mau, creator_revenue_cents, arpu_cents, retention_pct, conversion_pct };
}
```

### Daily Snapshots

```javascript
// Store in PlatformMetric collection
async function storeDailySnapshot(date) {
  const metrics = await computeMetricsForDate(date);
  for (const [metric, value] of Object.entries(metrics)) {
    await db.PlatformMetric.findOneAndUpdate(
      { date: startOfDay, metric },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
  }
}
```

### Third-Party Analytics

```javascript
// Mixpanel integration
async function sendMixpanelEvent(eventName, distinctId, props = {}) {
  if (!process.env.MIXPANEL_TOKEN) return null;
  await fetch('https://api.mixpanel.com/track', {
    method: 'POST',
    body: JSON.stringify({
      event: eventName,
      properties: { distinct_id: distinctId, token, ...props },
    }),
  });
}

// Amplitude integration
async function sendAmplitudeEvent(eventType, userId, eventProperties = {}) {
  if (!process.env.AMPLITUDE_API_KEY) return null;
  await fetch('https://api2.amplitude.com/2/httpapi', { ... });
}
```

---

## 8. Content Engagement Metrics

### ContentEngagement Schema

```javascript
{
  contentId: ObjectId,
  contentType: 'stream' | 'product',
  likes: Number,
  shares: Number,
  comments: Number,
  saves: Number,
  watchTimeSeconds: Number,
  viewCount: Number,
  playCount: Number,
  completedViews: Number,
  completionRate: Number,     // 0-1
  regionCounts: { US: 100, BR: 50, ... },
}
```

### Metrics API

```
GET /content/streams/:streamId/engagement

{
  "views": 15230,
  "plays": 18500,
  "loop_rate": 1.21,
  "watch_time": 45000,
  "completion_rate": 0.72,
  "likes": 1250,
  "shares": 380,
  "comments": 95,
  "saves": 210
}
```

---

## 9. Logging Architecture

### Recommended Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| Log Collection | Promtail / Filebeat | Ship logs to aggregator |
| Log Storage | Loki / Elasticsearch | Indexed log storage |
| Log Visualization | Grafana / Kibana | Query and dashboard |

### Log Levels

| Level | Use Case |
|-------|----------|
| `error` | Exceptions, failures requiring attention |
| `warn` | Degraded behavior, approaching limits |
| `info` | Significant business events |
| `debug` | Detailed debugging (dev only) |

### Structured Logging (Fastify)

```javascript
app.addHook('onRequest', (request, reply, done) => {
  request.log.info({ 
    method: request.method, 
    url: request.url 
  }, 'incoming request');
  done();
});

app.addHook('onResponse', (request, reply, done) => {
  request.log.info({ 
    statusCode: reply.statusCode,
    duration: Date.now() - request.startTime
  }, 'request completed');
  done();
});
```

---

## 10. Environment Variables

```env
# Sentry
SENTRY_DSN=https://xxx@sentry.io/123

# Prometheus (default built-in)
# No config needed — /metrics exposed automatically

# Analytics
MIXPANEL_TOKEN=xxx
AMPLITUDE_API_KEY=xxx

# Health check thresholds
EMAIL_CONSOLE_DISALLOWED=true  # Fail health if console email in prod
```

---

## 11. Deployment

### Start Monitoring Stack

```bash
cd infra/monitoring
docker compose up -d

# Access:
# Grafana:    http://localhost:3001 (admin/admin)
# Prometheus: http://localhost:9090
```

### Verify Metrics

```bash
# Check API metrics endpoint
curl http://localhost:3000/metrics

# Check health
curl http://localhost:3000/health

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets
```

---

## Summary

| Layer | Tool | Purpose |
|-------|------|---------|
| Metrics | Prometheus | Time-series metrics |
| Dashboards | Grafana | Visualization |
| Alerting | Alertmanager | Incident notification |
| Errors | Sentry | Exception tracking |
| Logs | Loki/ELK | Log aggregation |
| Health | `/health` | Dependency status |
| Analytics | Mixpanel/Amplitude | User behavior |

### Key Metrics Tracked

| Category | Metrics |
|----------|---------|
| API Performance | Request count, latency (p50/p95/p99), error rate |
| Queue Health | Depth, active jobs, failures |
| Business | DAU, MAU, ARPU, retention, conversion |
| Content | Watch time, completion rate, engagement |
| Payments | Success rate, errors, revenue |
| Streaming | Viewer count, stream health, latency |
| Moderation | Queue depth, action rate, appeals |
