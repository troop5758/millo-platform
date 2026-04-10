# Load testing

**Production target:** https://milloapp.com  
Use **staging** or **isolated** clusters first; coordinate with **rate limits**, **WAF**, and **cost** (egress, Kafka, DB).

## Tools

| Tool | Strength | Good for |
|------|----------|----------|
| **[k6](https://k6.io/)** | High-efficiency HTTP/WebSocket, scripting in JS, cloud execution | **10k concurrent viewers** (HLS segment fetches, API reads, WS fan-out patterns). |
| **[Locust](https://locust.io/)** | Python, web UI, distributed workers | **Mixed scenarios**, **1k live streams** *signaling* (HTTP) — RTMP publish itself usually needs **ffmpeg** or **multi-host** load tools, not Locust alone. |

---

## Target scenarios

### ~10k concurrent viewers

- **Playback path:** `GET` **m3u8** + **.ts** (or CDN edge) — see `infra/cdn-video-delivery.md`.
- **API path:** read-mostly endpoints (feed, stream metadata) with **realistic auth** if tests hit protected routes.
- **WebSocket:** k6 **experimental WebSocket** or separate tooling for **chat** fan-out; scale generators across machines (k6 cloud, or multiple k6 instances with split VUs).

**Practices:** ramp **VUs** gradually (`stages`), set **thresholds** (p95 latency, error rate), watch **origin** hit ratio if testing through CDN.

### ~1k live streams

- **RTMP ingest:** 1k concurrent publishers typically requires **many IPs / nodes** (ffmpeg → `rtmp://ingest.../live/<key>`). Use **Kubernetes Jobs**, **cloud VMs**, or a **specialized RTMP load suite**; Locust/k6 do not speak RTMP natively.
- **Control plane:** Load-test **stream start/stop** APIs (`POST /live/start`, etc.) with Locust/k6 **throttled** to avoid creating 1k real encoders unless intended.
- **Janus/WebRTC:** separate load tools (e.g. **pion**, **webrtc stress** harnesses) — out of scope for basic k6/Locust HTTP scripts.

---

## Examples in this repo

| File | Purpose |
|------|---------|
| `infra/loadtest/k6-millo.example.js` | k6: ramp VUs, hit `/health` + optional HLS path |
| `infra/loadtest/locustfile.example.py` | Locust: baseline HTTP user class |

Copy, adjust **`BASE_URL`**, paths, and headers; add auth tokens from your test tenant.

---

## Commands

**k6** (install: [k6.io/docs](https://k6.io/docs/get-started/installation/)):

```bash
export MILLO_BASE_URL=https://staging-api.example.com
k6 run infra/loadtest/k6-millo.example.js
```

**Locust**:

```bash
pip install locust
locust -f infra/loadtest/locustfile.example.py --host http://127.0.0.1:3000
```

---

## Observability during tests

- **Kubernetes:** `kubectl top pods`, HPA events, KEDA ScaledObject status (`infra/auto-scaling-strategy.md`).
- **Kafka:** consumer lag, broker disk (`infra/kafka-multi-cluster.md`).
- **DB:** connection pool, replication lag (`infra/global-database-strategy.md`).
- **CDN:** cache hit ratio, 5xx at edge (`infra/cloudflare/cdn-rules.md`).

---

## Related

- `infra/auto-scaling-strategy.md`
- `infra/cdn-video-delivery.md`
- `infra/obs-rtmp-ingest-pro.md`
