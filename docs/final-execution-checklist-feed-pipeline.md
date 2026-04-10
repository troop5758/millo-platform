# Final execution checklist — feed & ranking pipeline

End-to-end verification for **data → features → ranking → performance → optimization**.  
Production domain: `https://milloapp.com`

Use this before calling the feed stack “done” in an environment. Status is **capability-based** (code + env); production still needs brokers, Redis, load, and SLO measurement.

---

## 🔴 DATA

| Check | Target | Where / how |
|--------|--------|-------------|
| Events tracked correctly | `FeedEvent` rows match client sends | `POST /feed/events/impression|watch|engagement|negative` → `packages/api/src/routes/feed.js` → `packages/database/src/schemas/FeedEvent.js` |
| Event types valid | impression, play, watch_*, complete, engagement, negative | Allowed sets in `feed.js`; SDK `packages/web/src/sdk/contentApi.js` |
| Kafka pipeline working | Messages on `feed.*` and optional `rank.predictions` | `packages/api/src/services/kafkaEventBus.js` (`FEED_IMPRESSION`, `FEED_WATCH`, `FEED_ENGAGEMENT`, `FEED_NEGATIVE`, `RANK_PREDICTIONS`); `packages/api/src/services/feedEvents.producer.js` |
| User action → bus | Behavioural stream for features | `packages/api/src/events/track.js` → topic `user_events` (when Kafka enabled) |

**Env (typical):** `KAFKA_ENABLED=true`, brokers configured; `FEED_EVENTS_ENABLED` not `false`.

**Quick verify:** POST a feed event with Bearer token → Mongo `FeedEvent` + consumer lag on `feed.watch` / `feed.impression` (if monitoring).

---

## 🟠 FEATURES

| Check | Target | Where / how |
|--------|--------|-------------|
| Feature extraction running | Worker consumes and updates feature docs | `packages/workers/features.worker.js` (and related feature jobs as deployed) |
| User profiles built | `UserProfileFeatures` populated per user | Schema `packages/database/src/schemas/UserProfileFeatures.js`; readers `packages/discovery/src/feed.service.js`, `candidateGenerator.js`, `profile.service.js` |
| Content features | `ContentFeatures` for candidates | `packages/discovery/src/candidateGenerator.js`; workers / ingestion as configured |
| Embeddings path (optional) | Vector fields / ANN hook | `packages/api/src/services/feed/vectorRetrieval.js`, `contentEmbedding.service.js` (if enabled) |

**Quick verify:** `UserProfileFeatures.findOne({ userId })` after real usage; worker logs / queue health.

---

## 🟡 RANKING

| Check | Target | Where / how |
|--------|--------|-------------|
| Score function active | Heuristic scores on slate | `packages/discovery/src/ranker.js` (`scoreFeatures`), `featureBuilder.js`; `buildForYouFeed` in `packages/discovery/src/feed.service.js` |
| Feed sorted by score | Ordered `items` with `rank` / `score` | Response of `GET /feed/for-you`, `GET /feed/explore`; `observeFeedPipeline` → `millo_feed_item_final_score` in `packages/api/src/routes/metrics.js` |
| Following feed (chronological + light) | Separate path | `GET /feed/following` → `buildFollowingFeedLight` in `feed.service.js` |
| Simple realtime ranker | Optional path | `GET /feed/realtime` + `packages/api/src/services/ranking.service.js` |

**Env:** `FEED_FOR_YOU_ENABLED` not `false`; realtime: `FEED_REALTIME_SIMPLE_ENABLED=true`.

---

## 🔵 PERFORMANCE

| Check | Target | Where / how |
|--------|--------|-------------|
| Redis caching enabled | Personalized feed JSON cache | `FEED_REDIS_CACHE_ENABLED=true`; `packages/api/src/services/feedPersonalizationCache.service.js`; `REDIS_URL` / `REDIS_HOST` |
| Cache hit/miss visibility | Prometheus | `millo_redis_cache_hits_total` / `millo_redis_cache_misses_total` with layer `feed_personalized` |
| Feed builds latency | **SLO target &lt; 200ms** (p95 — measure, not hardcoded) | Histogram `millo_feed_build_duration_seconds`; API traces / `observeFeedPipeline` duration in snapshot |
| Discovery trending cache | Redis optional | `packages/discovery/src/candidateGenerator.js` (`TRENDING_CACHE_KEY`) |

**Note:** “&lt;200ms” is an **operational SLO**: tune `limit`, candidates, DB indexes, and cache TTL (`FEED_REDIS_CACHE_TTL_SEC`); confirm with Grafana or load tests.

---

## 🟣 OPTIMIZATION

| Check | Target | Where / how |
|--------|--------|-------------|
| A/B testing (discovery weights) | Buckets + overrides | `FEED_RANK_AB_ENABLED=true` → `packages/api/src/services/experiments.js` → `buildForYouFeed({ context.rankWeightOverrides })` |
| A/B testing (simple ranker) | Likes weight arms | `RANKING_AB_TEST_ENABLED=true` → `packages/api/src/services/abtest.js` + `ranking.service.js` |
| Metrics tracked (product KPIs) | Watch time, CTR parts, completion | Prometheus `millo_feed_kpi_*` from `recordFeedKpiFromFeedEvent` in `packages/api/src/routes/metrics.js` (on `FeedEvent` write) |
| Metrics tracked (aggregates) | Admin snapshot | `GET /analytics/feed-kpis` → `packages/api/src/services/analyticsService.js` (`getFeedProductMetrics`) |
| AI shadow (optional) | No auto-apply | `docs/phase-16-ai.md`, `@millo/ai-optimization` |

---

## One-page go / no-go

| Area | Emoji | Gate |
|------|--------|------|
| DATA | 🔴 | Events persist + Kafka emits (or explicit decision to run without Kafka in dev) |
| FEATURES | 🟠 | Profiles exist for test users used in ranking |
| RANKING | 🟡 | For You returns non-empty or explicit empty cold-start; scores present |
| PERFORMANCE | 🔵 | p95 build &lt; 200ms **or** cache hit rate + latency documented as acceptable |
| OPTIMIZATION | 🟣 | KPI metrics + A/B flags understood; no blind launches |

---

## Related docs

- `docs/discovery-recommendation-pipeline.md` — architecture
- `docs/discovery-ranking-metrics.md` — Part 17 / KPI definitions
- `docs/feed-reference-stack.md` — feed events reference
- `docs/ai-upgrade-path-feed-ranking-5x.md` — learned ranking roadmap

---

*Checklist for the feed/recommendation execution path; does not replace phase priming docs or security review.*
