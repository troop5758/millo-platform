# Monitoring — Prometheus + Grafana (Part 10)

**Domain:** https://milloapp.com

## Run locally

**Monitoring only** (API on your host at port 3000):

```bash
cd infra/monitoring
docker compose up -d
```

**Full stack** from repo root: `docker compose up -d prometheus grafana` uses `prometheus.docker-stack.yml` so Prometheus scrapes the `api` service at `api:3000`.

- **Prometheus:** http://localhost:9090  
- **Grafana:** http://localhost:3001 (default `admin` / `admin` — change immediately)

## API metrics (`packages/api`)

Scraped at `GET /metrics` (job `millo-api`).

**Admin JSON (auth: admin role):** `GET /admin/metrics/system`, `/payments`, `/live`, `/queues` — snapshots aligned with Grafana/Prometheus (`millo_*` names); scrape remains `GET /metrics`.

| Metric | Description |
|--------|-------------|
| `millo_stream_latency_ms_*` | Histogram — time for `POST /live/start` (startStream + Janus) |
| `millo_active_streams` | Gauge — streams started minus ended on this process |
| `millo_gift_transactions_total` | Counter — successful `POST /content/gifts/send` |
| `rate(millo_gift_transactions_total[1m])` | **Gifts per second** (example `gift_transactions_per_sec`) |
| `millo_feed_*` | **For You pipeline** (Part 17–18): `millo_feed_build_duration_seconds`, candidate counts, `millo_feed_item_final_score`, `millo_feed_creator_hhi`, `millo_feed_builds_total{cold_user, experiment_bucket}` — see [discovery-ranking-metrics.md](../../docs/discovery-ranking-metrics.md) |
| `millo_redis_cache_hits_total` / `millo_redis_cache_misses_total` | Feed cache (`layer="feed"`) |
| `millo_*` default Node metrics | CPU, memory (`millo_process_*`) |

## Optional exporters (Prometheus)

`prometheus.yml` includes scrape jobs for:

- **`redis`** — [redis_exporter](https://github.com/oliver006/redis_exporter) on `host.docker.internal:9121` → `redis_keyspace_hits_total`, `redis_keyspace_misses_total`, memory, etc.
- **`kafka`** — Strimzi Kafka Exporter, [danielqsj/kafka-exporter](https://github.com/danielqsj/kafka-exporter), or similar on `host.docker.internal:9308` → `kafka_consumergroup_lag` (name varies by exporter; adjust alerts/dashboards).

If a target is not running, Prometheus marks it **DOWN** — remove or comment the job, or point `static_configs.targets` at your real hosts.

## Alerts

`alerts.yml` — includes API errors, latency, memory, stream go-live latency, optional Kafka lag and Redis hit ratio. Tune thresholds for your environment.

## Grafana dashboard

Folder **Millo → Millo — Observability (Part 10)** is provisioned from `grafana/dashboards/millo-observability.json`.
