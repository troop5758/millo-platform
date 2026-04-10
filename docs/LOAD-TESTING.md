# Load testing

Run **before a major launch** to validate capacity, autoscaling, and SLO headroom. Execute in **staging** (or an isolated **soak** environment) with **production-like** ratios—not against production without explicit approval.  
https://milloapp.com

---

## Target scenarios (launch gates)

| Scenario | Target (example) | Notes |
|----------|------------------|--------|
| **Concurrent users** | **~10k** concurrent *simulated clients* | Define what a “user” does: e.g. auth + feed read + occasional write. Spread across **read** APIs, **WebSockets** (`/user/ws`, `/admin/ws` if in scope), and **static/CDN** separately—API-only tests undercount real browsers. |
| **Live streams** | **~1k** concurrent **publishers** or **rooms** | Very **infrastructure-heavy** (ingest, transcoding, HLS, SFU/Janus if used). Validate **independently** from generic API load; may require **dedicated** streaming test harness and provider quotas. |

These numbers are **goals**, not guarantees—your cloud limits, DB size, and Redis/Kafka capacity determine feasibility.

---

## What to measure

- **SLOs** — API availability, feed p95, live go-live latency (`docs/infra-monitoring.md`).
- **Saturation** — CPU/memory on API workers, **Mongo** op latency, **Redis** latency, **queue depth** (`millo_queue_depth`), **Kafka** lag.
- **Errors** — 5xx rate, payment errors, stream start failures, WebSocket disconnect rate.
- **Cost** — Autoscaler behavior and bill shock during the test window.

---

## Tooling (examples)

- **HTTP / WebSocket** — [k6](https://k6.io/), Locust, Gatling (script scenarios against `VITE_API_URL` / staging host).
- **Live** — Often needs **custom** publishers (FFmpeg loop, WebRTC load tools) plus **viewer** simulation; coordinate with streaming runbooks (`docs/RUNBOOKS-BY-SYSTEM.md`).

Store scripts in-repo only when they contain **no secrets**; parameterize base URL and tokens via env.

---

## Process

1. **Baseline** — Capture Grafana snapshots at current traffic.
2. **Ramp** — Step load (e.g. 1k → 5k → 10k) to find **knee of the curve**; avoid stepping straight to max without monitoring.
3. **Soak** — Hold **plateau** (e.g. 30–60 min) to catch leaks and queue buildup.
4. **Stop condition** — Abort if **error budget** burn, **P0** thresholds, or **provider** throttling occurs.
5. **Record** — Save dashboards + k6 summary; attach to launch checklist or postmortem if issues found.

---

## Related

- **`docs/DEPLOYMENT-SAFETY.md`** — staging and canary before launch.
- **`docs/infra-monitoring.md`** — metrics and dashboards.
- **`docs/RUNBOOK-ONCALL-MINIMUM.md`** — incident playbook if load test triggers alerts.
