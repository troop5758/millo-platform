# Observability & Monitoring

## 1. Health dashboard

**Endpoint**: `GET /health`

Returns a health dashboard with checks for:

- **database** — MongoDB ping
- **redis** — Redis PING
- **kafka** — Event bus enabled and brokers configured (no connect on each request)
- **storage** — S3/R2 configured (env: `AWS_S3_BUCKET` or `R2_ACCOUNT_ID`, etc.)
- **ai_services** — OpenAI, Hive, AWS Rekognition configured (for moderation)
- **economy** — Economy package loaded
- **notifications** — Notifications package loaded

Response shape:

```json
{
  "status": "ok",
  "ok": true,
  "criticalOk": true,
  "uptime": 123.45,
  "appVersion": "3.0.0",
  "gitCommit": "...",
  "buildDate": "...",
  "checks": {
    "database": { "status": "ok" },
    "redis": { "status": "ok" },
    "kafka": { "status": "ok" | "disabled" },
    "storage": { "status": "ok" | "not_configured" },
    "ai_services": { "status": "ok", "openai": "configured", "hive": "off", "rekognition": "off" },
    "economy": { "status": "ok" },
    "notifications": { "status": "ok" }
  },
  "ts": "2026-02-25T..."
}
```

HTTP **503** when `criticalOk` is false (database or redis failed).

---

## 2. Queue dashboard (BullMQ)

**Endpoints** (admin only):

- `GET /admin/queues`
- `GET /dashboards/admin/queues`

Returns job counts per BullMQ queue: **waiting**, **active**, **delayed**, **failed**, **completed**, **paused**. Queues include: `trust-decay`, `payout-retry`, `payment-deadline`, `scheduled-streams`, `stream-reminder`, `live-events`, `dm-timeout`, `fraud-check`, `bot-detection`.

**BullMQ Arena UI** (optional): Install `bull-board` or `bull-arena` and mount a separate Express app (or Fastify plugin) to get a web UI for jobs, retries, and failed job inspection. Example:

```bash
npm install bull-arena
```

Then mount Arena in a separate admin app or route that serves the Arena UI, pointing it at the same Redis and queue names. The API above provides the same data for custom dashboards.

---

## 3. Logging (Winston + Loki / ELK)

- **Winston** is used in `packages/api/src/utils/logger.js`: console + file (`logs/app.log`). Optional transports:
  - **Loki** (Grafana): set `LOG_LOKI_ENABLED=true` and `LOG_LOKI_HOST` (e.g. `http://127.0.0.1:3100`). Uses `winston-loki`.
  - **Elasticsearch (ELK)**: set `LOG_ELASTIC_ENABLED=true` and `LOG_ELASTIC_NODE` (e.g. `http://localhost:9200`). Uses `winston-elasticsearch`. Optional `LOG_ELASTIC_INDEX_PREFIX`, `LOG_ELASTIC_USERNAME`, `LOG_ELASTIC_PASSWORD`.

- **Pino**: Fastify’s default logger is Pino (`logger: true` in `app.js`). Request logs use Pino; application code can use the Winston logger from `utils/logger.js` for structured logs that ship to Loki/ELK.

- **Env** (see `.env.example`): `LOG_LEVEL`, `LOG_LOKI_ENABLED`, `LOG_LOKI_HOST`, `LOG_ELASTIC_ENABLED`, `LOG_ELASTIC_NODE`, `LOG_ELASTIC_INDEX_PREFIX`, `LOG_ELASTIC_USERNAME`, `LOG_ELASTIC_PASSWORD`.

---

## 4. Grafana dashboards

Prometheus metrics are exposed at **`GET /metrics`**. Use them in Grafana with a Prometheus data source.

### Suggested panels

| Dashboard / use case | Metric / source | Notes |
|----------------------|------------------|--------|
| **Stream metrics** | `millo_queue_depth{queue="live-events",state="waiting"}` etc.; custom live viewer/stream gauges if added | Queue depth for live-events; add app-specific stream metrics if implemented |
| **Moderation volume** | `millo_http_requests_total{route="/moderation/*"}`; `millo_http_request_duration_seconds` by route | Request count and latency for moderation routes |
| **Payment success rate** | `millo_http_requests_total{route="/payments/*",status="2xx"}` vs `status=~"4..|5.."`; `millo_payment_errors_total` | Success vs error counts; payment error counter |
| **Fraud detection** | `millo_queue_depth{queue="fraud-check"}`; `millo_queue_depth{queue="bot-detection"}`; `millo_worker_failures{queue="fraud-check"}` | Queue depth and failed jobs for fraud and bot-detection queues |

### Prometheus metrics (reference)

- `millo_http_requests_total` — labels: `method`, `route`, `status`
- `millo_http_request_duration_seconds` — labels: `method`, `route`, `status`; buckets for latency
- `millo_payment_errors_total` — labels: `route`, `status`
- `millo_queue_depth` — labels: `queue`, `state` (waiting, active, delayed, failed, completed, paused)
- `millo_worker_failures` — labels: `queue` (failed job count per queue)
- Node/process: `millo_*` default metrics (CPU, memory, etc.) from `prom-client`

Scrape config example:

```yaml
scrape_configs:
  - job_name: 'millo-api'
    static_configs:
      - targets: ['api:3001']
    metrics_path: /metrics
```

Use these in Grafana with Prometheus as data source; build dashboards for stream metrics, moderation volume, payment success rate, and fraud detection as above.
