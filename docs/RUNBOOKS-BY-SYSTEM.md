# Runbooks (by system)

Operational shortcuts per subsystem. **Do not** paste live secrets into chat or shared terminals. Prefer secret manager / Stripe Dashboard. **Money and admin overrides must be auditable** (Millo system rules).  
https://milloapp.com

---

## Payments failure

### Symptoms

- Checkout failing (client errors, 5xx on `/payments*`)
- Webhooks not firing (Stripe Dashboard → Developers → Webhooks → recent deliveries)
- Spikes in `millo_payment_errors_total` or alert **PaymentsHighFailureRate**

### Actions (triage)

1. **Provider dashboards** — Stripe (or other PSP): incident page, API status, webhook delivery logs.
2. **Config (no `echo` of secrets)** — Confirm payment env is set in your deployment (see `docs/ENV-SETUP-GUIDE.md`). In Kubernetes: `kubectl get secret … -o yaml` (values base64) only on secure admin workstations; prefer **compare** “key exists” vs printing.
3. **API logs** — Search for `STRIPE_`, `PAYMENT`, `webhook`, `5xx` on the API/worker process (however you run: systemd, Docker, PM2, etc.). Example filter (adjust to your log stack):
   ```bash
   # Illustrative — replace with your log pipeline
   journalctl -u millo-api -n 500 | grep -i stripe
   ```
4. **HTTP surface** — `GET` health/metrics; confirm no global 5xx storm masking payments.

### Mitigation (fail closed)

- **Contain** — Admin **kill-switch** where applicable: `POST /dashboards/admin/kill-switch` (authenticated admin). See `GET /security/kill-switches` for current flags. **Log / audit** any override.
- **Do not** rely on undocumented env toggles; follow env docs and change control.
- **Retries** — Inspect BullMQ queues in metrics (`millo_queue_depth`): e.g. `fraud-check`, `payout-retry`. Stuck jobs: use your worker ops runbook (retry DLQ, fix root cause first).

---

## Live streaming failure

### Symptoms

- Users can’t go live (start errors, timeouts)
- Streams disconnect; `millo_active_streams` or viewer counts abnormal
- Alert **LiveGoLiveLatencySLOBreached** / **SlowStreamGoLive**

### Actions

1. **API path** — Logs around `POST /live/start`, `janusService` (`packages/api/src/services/live/janusService.js`), `millo_stream_latency_ms` in Grafana.
2. **Janus / SFU** — Repo includes K8s manifests: `infra/k8s/deployment-janus.yaml`, configs under `infra/janus/`. Example (adjust namespace/labels):
   ```bash
   kubectl get pods -l app=janus
   kubectl logs deploy/janus --tail=200
   ```
   Docker Compose–only environments: `docker ps` / `docker compose ps` and filter Janus service name from your compose file (`infra/streaming/docker-compose.yml` where applicable).
3. **Infra** — UDP `10000` / LB stickiness per `docs/architecture-infrastructure-stack.md` (Janus section).

### Mitigation

- Restart or roll Janus **only** after isolating bad revision; prefer **rolling restart** on K8s to drain sessions.
- If ingest/HLS path is in use, verify RTMP/FFmpeg/transcoder health from your streaming stack docs.

---

## Feed failure

### Symptoms

- Blank or stale feed, very slow first page
- `FeedBuildLatencyHigh` alert; Redis errors in API logs

### Actions

1. **Feature flags** — `FEED_FOR_YOU_ENABLED`, `FEED_REDIS_CACHE_ENABLED`, etc. (see `packages/api/src/routes/feed.js` header comments).
2. **Redis** — Confirm `REDIS_URL` and connectivity (not auth failures).
3. **Targeted cache invalidation** — API feed contract cache uses keys like **`feed:<userId>`** (first page, TTL **60s**). Personalization uses **`feed:<userId>:<scope>`** (see `feedPersonalizationCache.service.js`).

**Never run `redis-cli FLUSHALL` in production** — it wipes **all** Redis uses (rate limits, locks, sessions, queues metadata if shared). To clear **one user’s** feed cache for verification:
```bash
# Example — replace USER_ID; confirm Redis DB index matches Millo
redis-cli DEL "feed:USER_ID"
```

Prefer waiting **TTL (60s)** for contract cache during incidents unless you must force refresh.

---

## Kafka lag

### Symptoms

- Delayed moderation or downstream consumers
- Alert **HighKafkaConsumerLag** (requires Kafka exporter scraped as `job=kafka` in `infra/monitoring/prometheus.yml`)

### Actions

1. **Consumer lag**
   ```bash
   kafka-consumer-groups.sh --bootstrap-server YOUR_BROKER:9092 --describe --all-groups
   ```
   (Or your Strimzi / cloud CLI equivalent.)
2. **Correlate** — Which topic/group matches the delayed pipeline (moderation, analytics, risk). Check consumer pod restarts and error logs.
3. **Scale / pause** — Scale consumers if under-provisioned; **do not** blindly delete topics or reset offsets without a written plan (risk of reprocessing or loss of ordering expectations).

### Mitigation

- Fix slow consumers (DB hot spots, poison messages → DLQ).
- Temporarily reduce producer rate only if product-approved (may backlog elsewhere).
