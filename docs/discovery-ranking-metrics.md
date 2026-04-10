# Discovery / ranking metrics (Part 17)

**Domain:** https://milloapp.com  

You cannot tune ranking blind. Track **per-stage** signals in Prometheus/Grafana and **success / marketplace** signals in the warehouse (Kafka `feed.*`, `FeedEvent`, analytics).

---

## A) Per-stage (tuning the stack)

| Metric | Definition | Where |
|--------|------------|--------|
| **Candidate recall** | Count of unique `contentId` after merge (before policy) | `millo_feed_candidates_before_filter` (histogram) |
| **Filter drop rate** | `1 - after_filter / before_filter` per request; aggregate rate in Grafana | `millo_feed_candidates_after_filter` + before; or `rate` ratio |
| **Score distribution** | Histogram of `finalScore` per item in served slate | `millo_feed_item_final_score` |
| **Latency p50/p95/p99** | End-to-end `buildForYouFeed` wall time | `millo_feed_build_duration_seconds` |
| **Diversity** | Distinct creators / items in response (`1 - concentration`) | `millo_feed_distinct_creators_ratio` |
| **Creator concentration index** | HHI on creator share in slate: \(\sum_i (n_i/N)^2\) — lower is more diverse | `millo_feed_creator_hhi` |

**In-process (API):** `packages/api/src/routes/metrics.js` → `observeFeedPipeline(snapshot)` called from `GET /feed/for-you` via `buildForYouFeed({ observe })`.

---

## B) Feed success (product / ML labels)

| Metric | Definition | Source |
|--------|------------|--------|
| **Avg watch time / session** | Mean watch seconds per session | Warehouse: `feed.watch` + session join |
| **Completion rate** | `complete` / `play` (or qualified plays) | `FeedEvent` / `feed.watch` |
| **Like / share / follow / gift conversion** | Events / impressions | `feed.engagement` + `feed.impression` join |
| **Not interested rate** | `not_interested` / impressions | `feed.negative` |
| **Report rate** | `report` / impressions | `feed.negative` |
| **Retention D1 / D7 / D30** | Returning users | Phase 12 `PlatformMetric` / analytics store |
| **Creator marketplace health** | Revenue / active creators / supply-side funnel | Economy + dashboards |
| **New creator exposure rate** | Impressions on content where `creatorColdStart` or age &lt; 24h / share of total imp | Join `rank.predictions` + `ContentFeatures.createdAt` + impressions |

---

## C) Grafana queries (examples)

- **p95 feed build:** `histogram_quantile(0.95, sum(rate(millo_feed_build_duration_seconds_bucket[5m])) by (le))`
- **Filter drop:** `1 - (sum(rate(millo_feed_candidates_after_filter_sum[5m])) / sum(rate(millo_feed_candidates_before_filter_sum[5m])))` — adjust if using native histogram vs classic
- **Cold user mix:** `sum(rate(millo_feed_builds_total{cold_user="true"}[1h])) / sum(rate(millo_feed_builds_total[1h]))`
- **Experiment mix (Part 18):** `sum(rate(millo_feed_builds_total{experiment_bucket="rank_v2"}[1h])) / sum(rate(millo_feed_builds_total[1h]))`

---

## E) A/B / experiment uplift (warehouse + labels)

| Metric | How to measure |
|--------|------------------|
| **Watch time uplift** | Mean session watch seconds by `experimentBucket` on `rank.predictions` → join `feed.watch` |
| **Retention uplift** | D1/D7/D30 return rate by bucket (user’s bucket at first impression in window) |
| **Negative feedback delta** | `not_interested` + `report` rate per impression by bucket (`feed.negative` / impressions) |
| **Monetization uplift** | Gift / purchase conversion or revenue per user-session by bucket |
| **Creator fairness delta** | HHI, new-creator exposure, tail creator impressions — Part 17 §A — stratified by `experimentBucket` |

**Labels:** `experimentBucket` on `rank.predictions`; Prometheus `millo_feed_builds_total{experiment_bucket=...}` for traffic balance only (not a substitute for causal uplift).

---

## F) Related

- [discovery-recommendation-pipeline.md](./discovery-recommendation-pipeline.md)
- [infra/monitoring/README.md](../infra/monitoring/README.md)
- Schemas: `FeedEvent`, `UserProfileFeatures`, `ContentFeatures` (phase-2)

---

*Millo 3.0 — ranking observability checklist.*
