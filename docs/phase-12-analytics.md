# Phase 12 — Global Analytics & Business Intelligence

**Owns:** Platform metrics (DAU, MAU, creator revenue, ARPU, retention, conversion), analytics integrations.  
**Depends on:** Phase 2 (schemas), economy, payments, sessions.

Track platform performance.

---

## Key Metrics

| Metric | Definition |
|--------|------------|
| **DAU** | Daily Active Users — distinct users with session/activity in last 24h |
| **MAU** | Monthly Active Users — distinct users with session/activity in last 30 days |
| **Creator revenue** | Total creator earnings (credits to CreatorWallet, payouts) |
| **ARPU** | Average Revenue Per User — total platform revenue / MAU |
| **Retention rate** | % of users active in period N who were also active in N+1 |
| **Conversion rate** | % of signups who made a purchase (or other conversion event) |

## Schemas

- **PlatformMetric** — date, metric (dau|mau|creator_revenue_cents|arpu_cents|retention_pct|conversion_pct), value, meta.

## API

- `GET /analytics/metrics` — Returns current metrics (DAU, MAU, creator_revenue_cents, arpu_cents, retention_pct, conversion_pct). Admin only.
- `GET /analytics/metrics/history?start=&end=&metric=` — Returns stored PlatformMetric rows for Grafana/Looker. Admin only.
- `POST /analytics/snapshot` — Compute and store daily snapshot. Body: `{ date?: ISO string }`. Admin only.

## Analytics Tools

| Tool | Use |
|------|-----|
| **Mixpanel** | Optional; `MIXPANEL_TOKEN` — send events via track API |
| **Amplitude** | Optional; `AMPLITUDE_API_KEY` — send events |
| **Grafana** | Connect to MongoDB or metrics API for dashboards |
| **Looker** | Connect to data warehouse / metrics API |

## Domain

All behaviour bound to https://milloapp.com.
