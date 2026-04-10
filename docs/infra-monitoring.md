# Monitoring and Alerting — Millo Platform

Prometheus, Grafana, and Sentry for production observability. https://milloapp.com

**Incident response (detect → postmortem):** see **`docs/RUNBOOK-ONCALL-MINIMUM.md` § 7 — Incident response playbook**.

## How the pieces connect

| Integration | Role |
|-------------|------|
| **Prometheus → metrics** | Pulls `GET /metrics` from the API (Prometheus text format). Same host metrics as in `packages/api` (`prom-client`). |
| **Grafana → dashboards** | Uses the **Prometheus** datasource (provisioned in Docker) to query metrics and show the **Millo** folder dashboards (`infra/monitoring/grafana/dashboards/`). |
| **Sentry → errors** | **API:** set `SENTRY_DSN` — Fastify reports 5xx to Sentry (`packages/api/src/index.js`). **Web:** set `VITE_SENTRY_DSN` at **build** time — React init + error boundary (`packages/web/src/main.jsx`, `App.jsx`). Sentry is independent of Prometheus/Grafana. |

## Stack

| Component | Purpose | Port |
|-----------|---------|------|
| **Prometheus** | Scrapes `/metrics` from API; evaluates alert rules | 9090 |
| **Grafana** | Dashboards, visualization | 3001 |
| **Sentry** | Error tracking, crash reporting | — (SaaS) |

## Quick Start (Docker Compose)

Full stack (API in Docker — Prometheus scrapes `api:3000`):

```bash
docker compose up -d prometheus grafana
```

API on host only (from repo root, use monitoring compose):

```bash
cd infra/monitoring && docker compose up -d
```

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin by default; change via `GRAFANA_ADMIN_PASSWORD`)

Production: set `GRAFANA_ROOT_URL` to your public Grafana URL (for example behind HTTPS on your ops domain). Public site and API remain `https://milloapp.com` / `https://api.milloapp.com` per platform config.

## API Metrics

The API exposes Prometheus metrics at `GET /metrics`:

- `millo_http_requests_total` — request count by method, route, status
- `millo_http_request_duration_seconds` — request latency histogram
- `millo_*` — default Node.js metrics (CPU, memory, event loop)

## Alert Rules

Defined in `infra/monitoring/alerts.yml`. Rules carry a **`priority`** label (`P0` / `P1` / `P2`) for **Alertmanager** routing (PagerDuty / Slack). Point `alerting.alertmanagers` in `prometheus.yml` at your Alertmanager and route `priority=P0` to on-call immediately.

### Pager response targets (SRE)

| Tier | Target | Example triggers (see `alerts.yml`) |
|------|--------|--------------------------------------|
| **P0** | Wake immediately | `APIDown`, `APIHighFailureRate` (>50% 5xx), `PaymentsHighFailureRate` (>20% 5xx on `/payments*`), `PaymentErrorsSpike`, `MongoDBExporterDown`, `KafkaExporterDown`, `HighErrorRate` (5xx burst) |
| **P1** | ≤ 15 min | `SlowAPI`, `FeedBuildLatencyHigh` (feed build p95 > 500ms), `LiveGoLiveLatencySLOBreached` / `SlowStreamGoLive`, `QueueWaitingBacklogHigh` |
| **P2** | ≤ 1 hour | `HighMemoryUsage`, `LowRedisHitRatio`, `HighKafkaConsumerLag` (analytics / pipeline lag proxy) |

### Incident severity levels (human classification)

| Level | Description |
|-------|-------------|
| **P0** | Full outage / money risk |
| **P1** | Major degradation |
| **P2** | Partial issue |
| **P3** | Minor bug |

**How this maps to paging:** Prometheus rules in `alerts.yml` use `priority: P0`–`P2` only. **P3** is normally **out of band** (issues, Sentry noise, QA)—no page; track in tickets and ship in normal release cadence. When you **open an incident**, set severity from **user impact** and **financial / safety** exposure (align with Millo rules: fail closed on money, audit overrides), not from the alert name alone.

**Not yet PromQL-only (add metrics or exporters):** “Email delays” (outbound mail queue SLA), “minor feature degradation” (define per feature SLI), “analytics lag” beyond Kafka lag — track via Loki logs, provider dashboards, or new counters, then add rules.

### Legacy table (subset)

| Alert | Condition | Severity |
|-------|-----------|----------|
| HighErrorRate | 5xx rate > 5 req/s for 2m | critical |
| SlowAPI | 95th percentile latency > 2s for 5m | warning |
| APIDown | API unreachable for 1m | critical |
| HighMemoryUsage | Process memory > 512MB for 5m | warning |

## Sentry

Set `SENTRY_DSN` in `.env` to enable error monitoring. Sentry captures:

- Unhandled exceptions (500+)
- Startup failures
- Request context (route, method)

## Required Grafana dashboards (SRE)

Three folders (or three dashboards) should exist in production. Use the **Prometheus** datasource scraping `GET /metrics` unless noted.

### 1. System Health

| Panel | Source | Example direction |
|-------|--------|-------------------|
| **CPU** | Node/process metrics (`prom-client` default metrics, `millo_` prefix) | `rate(process_cpu_user_seconds_total{job="millo-api"}[5m])` — exact labels match your `PROMETHEUS_JOB_NAME` / scrape config |
| **Memory** | Process RSS / heap | `process_resident_memory_bytes{job="millo-api"}` |
| **API latency (p50 / p95 / p99)** | `millo_http_request_duration_seconds` | `histogram_quantile(0.95, sum(rate(millo_http_request_duration_seconds_bucket[5m])) by (le, route))` |
| **Error %** | `millo_http_requests_total` | `sum(rate(millo_http_requests_total{status=~"5.."}[5m])) / sum(rate(millo_http_requests_total[5m]))` — tune to exclude health probes if scraped separately |

**Sentry:** link or embed Sentry for stack traces; Prometheus covers rates, not root cause.

### 2. Money Dashboard

| Panel | Source | Notes |
|-------|--------|--------|
| **Payments success %** | Define SLI (e.g. completed checkouts / attempts). Partial signal today: `millo_gift_transactions_total`, `millo_payment_errors_total` | PromQL is a **proxy** until business-level success/failure is exported consistently |
| **Payouts queue** | `millo_queue_depth` for worker queues | Queues include `payout-retry` (see `QUEUE_NAMES` in `packages/api/src/routes/metrics.js`). **DB-backed payout requests** (pending approvals) are not fully represented here—add a custom metric or a secondary datasource if needed |
| **Fraud blocks** | Not a dedicated Prometheus counter today | Options: log-based metrics (Loki), export a counter from fraud enforcement paths, or an admin/DB panel until instrumented |

### 3. Live System

| Panel | Source | Notes |
|-------|--------|--------|
| **Active streams** | `millo_active_streams` | Gauge maintained on stream start/end |
| **Go-live / stream path latency** | `millo_stream_latency_ms` | Histogram for API go-live path—not full end-to-end CDN/SFU |
| **Bitrate / drops** | SFU / ingest / CDN | **Not on API `/metrics` today**; add from Janus/mediasoup/provider metrics or client beacons |
| **Viewer concurrency** | Mongo-backed in admin JSON (`GET /admin/metrics/live` → `concurrentViewers`) | For Grafana-only ops, add **recording rules** or a small exporter that scrapes the same signal, or use a DB/plugin panel |

## Production Checklist

- [ ] Prometheus scraping API `/metrics`
- [ ] Grafana datasource configured (auto-provisioned in Docker)
- [ ] Alertmanager configured for notifications (Slack, PagerDuty, email)
- [ ] `SENTRY_DSN` set on API; `VITE_SENTRY_DSN` baked into web build; errors visible in Sentry
- [ ] **System Health**, **Money**, and **Live System** dashboards provisioned (see above)
- [ ] Gaps (fraud blocks, payment SLI, bitrate/drops, DB payout queue) tracked as follow-up metrics or panels
