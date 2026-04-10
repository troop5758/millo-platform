# RUNBOOK — ON-CALL MINIMUM

## Purpose

Minimum viable operational checks for Millo without requiring a bundled ELK/Loki stack in-repo.

---

## 1. Provider state checks

### Payments

**Check:**

- Stripe mode/config state
- PayPal mode/config state
- Wise mode/config state
- any money endpoint surfacing stub vs live mode

**Questions to answer:**

- Are live providers configured?
- Is any production flow still returning stub behavior?
- Are recent payment failures provider-specific or systemic?

### Auth

**Check:**

- OAuth provider configured state
- recent provider-disabled or callback errors

**Questions to answer:**

- Are users being routed into provider-not-configured states?
- Is a single provider failing or are all auth flows degraded?

### Trust & safety

**Check:**

- KYC provider mode
- AI moderation provider mode
- Cloudflare reputation mode

**Questions to answer:**

- Which safety surfaces are live vs stub today?
- Is UI/admin accurately reflecting that state?

### Notifications

**Check:**

- email provider mode
- push provider readiness
- device token readiness where applicable

**Questions to answer:**

- Are customer emails actually being delivered?
- Are promised push flows truly operational?

---

## 2. Worker and queue checks

**Check:**

- worker heartbeat/status
- queue depth
- failed jobs
- retry backlog
- payout/settlement/reassignment queue health where applicable

**Questions to answer:**

- Is there a stuck queue?
- Are failures isolated to one worker type?
- Are money-sensitive jobs retrying safely?

---

## 3. Payment failure and stub checks

**Check:**

- recent payment failures by provider
- endpoints exposing provider mode
- any mismatch between UI state and API money mode

**Questions to answer:**

- Are customers seeing live money UX backed by stub/provider-off flows?
- Are reference lookups failing because searchable references were never recorded in `PaymentReference`?

---

## 4. Discovery/feed honesty checks

**Check:**

- current paging semantics returned by discovery endpoints (`pagingMode`, caps, `hasMore`, etc.)
- feed rows missing title/thumb/media URL coverage
- UI messaging around “more pages” / empty states

**Questions to answer:**

- Is the UI implying stable infinite feed behavior?
- Are missing media rows degrading the experience in a visible way?

---

## 5. Support backlog checks

**Check:**

- open order-linked support backlog
- unresolved disputes/support items by model path
- whether order-related cases are landing in the intended support workflow

**Questions to answer:**

- Are order-linked cases split between Ticket and SupportTicket in practice?
- Is backlog growing because ownership/model usage is ambiguous?

---

## 6. Escalation minimum

**Escalate immediately if:**

- money flows appear live while providers are unconfigured or stubbed
- auth flows degrade into half-broken public UX
- safety surfaces are being marketed as live while actually stubbed
- customer communications depend on console-only delivery
- order-linked support incidents cannot be routed clearly

---

## 7. Incident response playbook

https://milloapp.com

### Step 1 — Detect

Signals (in parallel where possible):

- **Alerts** — Prometheus / Alertmanager (`infra/monitoring/alerts.yml`), Pager routes by `priority` (see `docs/infra-monitoring.md`).
- **Logs** — API/worker logs, provider dashboards (Stripe, etc.), optional Loki/ELK if deployed.
- **Admin dashboard** — `/admin/ops` (metrics WebSocket + HTTP fallback), Grafana folders (System / Money / Live).

### Step 2 — Triage

Answer: **which blast radius?**

- **Payments?** — 5xx on `/payments*`, `millo_payment_errors_total`, provider status, ledger/audit anomalies.
- **Live streaming?** — `millo_active_streams`, `millo_stream_latency_ms`, SFU/Janus health, viewer concurrency.
- **Feed?** — `millo_feed_build_duration_seconds`, discovery endpoints, cache/Redis.
- **Infra?** — `up{job="millo-api"}`, DB/Redis/Kafka scrape targets, queue depth, node memory/CPU.

### Step 3 — Contain

Goal: **stop bleeding** (especially money and safety). Prefer **documented** levers; **log every admin override** (Millo system rules).

**Millo-specific examples:**

- **Feature / surface kill-switch** — `POST /dashboards/admin/kill-switch` with admin auth (see dashboards kill-switch registry; `GET /security/kill-switches` for visibility). Use the documented `which` values only.
- **Payments** — Do **not** invent env flags. Stripe is gated by configuration (e.g. `STRIPE_SECRET_KEY` / documented payment env in `docs/ENV-SETUP-GUIDE.md`). Containment is usually **provider dashboard** (disable charges), **routing traffic away**, or **approved config change** with audit trail—not ad hoc `export` in prod shells.

**Infrastructure examples (illustrative — match your orchestrator):**

```bash
# Scale API (Kubernetes example — adjust deployment name/namespace)
kubectl scale deployment millo-api --replicas=10
```

### Step 4 — Mitigate

- **Rollback** deploy to last known good release (script-driven / CI).
- **Restart** failing workers or API pods after root cause is understood (avoid restart loops without diagnosis).
- **Switch region / failover** only if architecture supports it and runbook exists (DNS, DB replica, object storage).

### Step 5 — Communicate

**Internal**

- Slack: `#incident` (or your org channel).
- Example: *“Investigating payment failures — next update in 10 min.”*

**External (if user-visible)**

- Status page update when impact is broad or prolonged; align messaging with legal/comms.

### Step 6 — Resolve

- **Metrics** back inside SLO / error budget (see `docs/infra-monitoring.md`).
- **No data loss** — confirm DB replication, payouts ledger, moderation actions, and audit logs for the window.
- Clear alert noise (silence only with ticket link and owner).

### Step 7 — Postmortem (mandatory)

- Use **`docs/INCIDENT-POSTMORTEM-TEMPLATE.md`** (copy per incident).
- Timeline, impact, root cause, what worked / what didn’t.
- **Action items** with owners: code, alerts, runbook, capacity.
- Stored where your org requires (wiki, doc, ticket). Link related **audit** entries for money or admin actions taken during the incident.

---

## 8. Runbooks (by system)

System-specific triage and mitigation: **`docs/RUNBOOKS-BY-SYSTEM.md`** (payments, live, feed, Kafka).

---

## 9. Security incident response

For **data breach**, **fraud attack**, **account takeover**, and similar: **`docs/SECURITY-INCIDENT-RESPONSE.md`** (contain, lock accounts, rotate keys, notify stakeholders, audit).

---

## 10. Backup & recovery

**DB daily snapshots**, **S3 versioning**, **optional Redis** durability policy, and restore examples: **`docs/BACKUP-AND-RECOVERY.md`**.

---

## 11. Deployment safety

**No Friday deploys** (by default), **staging**, **canary**, **rollback**: **`docs/DEPLOYMENT-SAFETY.md`**.

---

## 12. Load testing

Before **major launch**: target **~10k concurrent users** and **~1k live streams** (methodology, tooling, SLOs): **`docs/LOAD-TESTING.md`**.

---

## 13. On-call rotation

**Primary / secondary**, **weekly** schedule, **responsibilities** (alerts, incident lead, postmortem): **`docs/ON-CALL-ROTATION.md`**.

---

## 14. Continuous improvement

After incidents: **add/tune alerts**, **improve dashboards**, **fix root cause**: **`docs/CONTINUOUS-IMPROVEMENT.md`**.
