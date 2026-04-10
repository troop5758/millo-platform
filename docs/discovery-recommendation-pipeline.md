# Discovery — TikTok-style recommendation pipeline (target architecture)

**Production domain:** https://milloapp.com  

This document is a **reality check**: a production feed is **not** a single model. It is a **pipeline** of candidate generation, safety, staged ranking, diversity, business rules, and feedback loops. Phase 7’s deterministic + multi-signal ranker remains the **current** shipping path; this doc describes the **full** system to build toward and how it maps to Millo.

**Compact vertical diagram (actions → Kafka → features → rank → `/feed` → client):** **`docs/feed-pipeline-user-actions-to-client.md`**

---

## 1) End-to-end flow

```
User opens feed
   ↓
Feed API (packages/api → redis.getFeed / @millo/discovery)
   ↓
Candidate Generator
   ├─ Follow graph candidates
   ├─ Similar-content ANN candidates
   ├─ Trending candidates
   ├─ Geo / language candidates
   ├─ Fresh upload exploration pool
   ↓
Trust & Safety Filter
   ├─ Moderation blocks
   ├─ Creator trust score
   ├─ Age / region policy
   ├─ Commerce / rights policy
   ↓
Ranker Stage A (fast rank)
   ├─ Logistic / GBDT / lightweight DNN
   ↓
Ranker Stage B (heavy rerank)
   ├─ Sequence model / multi-objective score
   ↓
Diversity + Exploration layer
   ├─ Dedupe
   ├─ Creator caps
   ├─ Topic spread
   ├─ Exploration bandit
   ↓
Post-ranking business rules
   ↓
Final feed response
```

---

## 2) Mapping to this repository (today vs next)

| Stage | Role | Millo today (approx.) | Next steps |
|--------|------|------------------------|------------|
| **Feed API** | Pagination, auth, cache | `packages/api/src/server/services/redis.js` (`getFeed`), discovery routes | **`GET /feed/for-you`** — `packages/api/src/routes/feed.js` (Bearer auth); **`feed.service.buildForYouFeed`**; blocks from `Block`; Kafka **`rank.predictions`** via `emitFeedEvent`. Disable: **`FEED_FOR_YOU_ENABLED=false`**. **POST `/feed/events/*`** — persist `FeedEvent` + `feed.impression` / `feed.watch` / `feed.engagement` / `feed.negative` ([feed-reference-stack.md](./feed-reference-stack.md)); **`FEED_EVENTS_ENABLED=false`** disables. |
| **Candidate generation** | Recall (wide) | `packages/discovery/src/feedGenerator.js` (live/event feeds); **`packages/discovery/src/candidateGenerator.js`** — `generateCandidates(userId)` merges follow / trending (Redis cache `feed:trending:candidates`) / fresh 24h / language / topic placeholder for ANN | Populate **`UserProfileFeatures`**; optional Redis `u:{userId}:follows` JSON array; else **Mongo `Follow`**. Add vector DB for `getEmbeddingCandidates`. |
| **Trust & safety filter** | Hard/soft gates | Phase 9 content filter on queries; `shadowBanned` + `SHADOW_BAN_RANK_MULTIPLIER` in `rankingEngine.js`; **`packages/discovery/src/policyFilter.js`** — `filterCandidates(candidates, context)` (moderation, `trustScore` &lt; `DISCOVERY_TRUST_BLOCK_THRESHOLD` default -50, blocked/hidden lists, language vs `allowMultilingual`) | Wire `context` from blocks, user prefs, enforcement |
| **Ranker A (fast)** | Cheap scoring | `rankingEngine.computeDiscoveryScore` + `rank()` / `rankDiscovery`; **`featureBuilder.buildPairFeatures`** + **`ranker.scoreFeatures`** (sigmoid + `finalScore`); **`sessionContext.deriveSessionBoosts(recentEvents)`** → `pair_session_topic_boost` / `pair_session_type_penalty` in features + score | Swap in XGBoost / LightGBM / TorchServe; keep feature dict contract |
| **Ranker B (heavy)** | Contextual rerank | Partially: Kafka→Redis scores `redisDiscoveryRank.js` | Sequence / two-tower rerank service; batch or small real-time |
| **Diversity + exploration** | Slates | **`postRanker.diversifyAndCap`**; **`exploration.injectExploration`**; **cold users** (`coldStart.isUserColdStart`) → **`allowMultilingual`**, ~**35%** exploration (`COLD_USER_EXPLORATION_RATIO`), main vs explore split via **`isExploreCandidateRow`** | MMR/topic spread; bandit arms |
| **Creator / user fairness** | Cold start | **`packages/discovery/src/coldStart.js`** — `creatorColdStartBoost(item)` (+0.12 in `finalScore`); `pair_user_cold_start` → stronger language/region in `pLongWatch` logit; onboarding topics via existing `categoryAffinityTop` + trending/fresh pools | Tune thresholds; fast onboarding interests in `UserProfileFeatures` |
| **Post-ranking rules** | Product/compliance | **`packages/discovery/src/businessRules.js`** — `applyBusinessRules(rows, options)` after diversity: `hideCommerce`, **≤1 ad per N slots** (`adsEveryNSlots`), **≤K creators in window** (`maxPerCreatorInWindow` / `creatorWindowSize`), **commerce & live density** in windows, **`userLiveSkipRate`** tightens live cap (`effectiveLiveWindowCap`). API shim: `packages/api/src/services/feed/businessRules.js` | Featured slots, promos, compliance inserts |
| **Online learning** | Close the loop | `video.view`, `video.like`, gifts, etc. → Kafka workers | Logged impressions + outcomes; training pipelines; experiment weights |

---

## 3) Ranking objectives (multi-outcome)

Optimize **multiple** outcomes, not views alone.

### Core objectives (signals to predict or estimate)

- **P(view-through)** or **qualified play** (long watch / meaningful play)
- **Expected watch time**
- **Completion rate**
- **P(like), P(comment), P(share), P(follow)**
- **P(gift | purchase | subscription)**
- **Negative feedback:** fast skip, not interested, report, hide creator

### Final score (weighted objective)

Tune weights via experiments (holdouts, A/B, interleaving).

```
final_score = (
    1.20 * p_long_watch +
    0.90 * expected_watch_time +
    0.65 * p_like +
    0.55 * p_share +
    0.75 * p_follow +
    1.10 * p_gift_or_buy +
    0.40 * freshness_score +
    0.25 * exploration_bonus -
    1.30 * p_fast_skip -
    2.50 * p_report -
    1.10 * policy_risk_penalty
)
```

**Implementation reference:** `packages/discovery/src/multiObjectiveRanker.js` — `computeFinalFeedScore(signals, weights?)` returns `finalScore` and a `breakdown` for explainability.

**Scaling note:** `expected_watch_time` should be **normalized** to a comparable scale (e.g. `[0, 1]` via `min(1, seconds / T_max)`) so it is comparable to probabilities in v1; adjust when moving to calibrated regression outputs.

---

## 4) Data model (MongoDB)

Authoritative schemas live in `@millo/database` (not `server/models/`).

| Model | Collection | File |
|-------|------------|------|
| **UserProfileFeatures** | `userprofilefeatures` | `packages/database/src/schemas/UserProfileFeatures.js` |
| **ContentFeatures** | `contentfeatures` | `packages/database/src/schemas/ContentFeatures.js` |
| **FeedEvent** | `feedevents` | `packages/database/src/schemas/FeedEvent.js` |

- **UserProfileFeatures** — one document per `userId` (string, unique): locale (`en-US`), country (`US`), language (`en`), rolling rates (defaults `0`), top creator/category affinities, optional `embedding` vector. `createdAt` / `updatedAt` via Mongoose `timestamps: true`.
- **ContentFeatures** — one per `contentId` (string, unique): `creatorId` (required), `type` enum default `short`, `language`/`region` defaults (`en` / `US`), topics/hashtags, CTR/watch/completion/conversion aggregates (defaults `0`), `embedding`, `moderationState` ∈ pending \| approved \| rejected \| restricted (default `approved`), `trustScore`. `createdAt` / `updatedAt` via `timestamps: true`; compound indexes `(creatorId, createdAt)`, `(moderationState, createdAt)`, `(language, createdAt)`, `(topics, createdAt)`.
- **FeedEvent** — append-only events: `eventType` ∈ impression, play, watch milestones, complete, social, monetization, negative feedback; `watchTimeMs` / `position` default `0`, `source` default `for_you`, optional `topic`, `contentType`, `meta` (Mixed); `ts` = event time; Mongoose `createdAt` / `updatedAt`. Compound indexes `(userId, ts)`, `(contentId, ts)`, `(eventType, ts)`.

Constants for enums: `ContentFeatures.CONTENT_TYPES`, `ContentFeatures.MODERATION_STATES`, `FeedEvent.FEED_EVENT_TYPES`.

---

## 4.1) Kafka topics (event stream)

| Topic | Purpose |
|-------|---------|
| `feed.impression` | Slate / item shown (position, request_id) |
| `feed.watch` | Play / watch milestones (aligned with `FeedEvent` watch types) |
| `feed.engagement` | Like, comment, share, follow_creator, gift, purchase |
| `feed.negative` | skip_fast, not_interested, report |
| `feature.user.updates` | `UserProfileFeatures` materialization / deltas |
| `feature.content.updates` | `ContentFeatures` materialization / deltas |
| `rank.train.samples` | Labeled rows for offline training |
| `rank.predictions` | Shadow or prod prediction logs |
| `creator.trust.updates` | Trust score changes affecting discovery filters |
| `content.moderation.updates` | Moderation outcomes affecting eligibility (distinct from `content.moderation` AI queue) |

**Code**

- Constants: `packages/api/src/services/kafkaEventBus.js` → `TOPICS.FEED_*`, `FEATURE_*`, `RANK_*`, `CREATOR_TRUST_UPDATES`, `CONTENT_MODERATION_UPDATES`.
- Producer: `packages/api/src/services/feedEvents.producer.js` → `emitFeedEvent(topic, payload)` (allowlisted topics only; uses shared bus with retries + `ts`).
- Facade: `packages/api/src/server/services/kafka.js` → `sendFeedPipelineEvent(topic, payload)`.
- **Dev:** with `KAFKA_ENABLED=true`, API startup calls `ensureTopics()` and creates any missing topics from `TOPICS`.
- **K8s (Strimzi):** `infra/k8s/kafka-topics-recommendation-pipeline.yaml` — declarative `KafkaTopic` CRs (`spec.topicName` = dotted name).

---

## 5) Online learning + feedback loops

1. **Impression logging** — (user, item, position, timestamp, request_id) for every feed response.  
2. **Outcome events** — watch segments, likes, shares, follows, gifts, reports, skips (already partially via Kafka topics / analytics).  
3. **Training** — offline batch + periodic refresh of Ranker A/B; shadow mode before promote.  
4. **Experimentation** — weight vectors per cohort; guardrails on negative engagement and policy risk.

### 5.1) Training sample worker (Kafka)

- **`packages/api/src/workers/rankTrainingSample.worker.js`** — consumes **`feed.watch`**, **`feed.engagement`**, **`feed.negative`**; derives labels via **`packages/api/src/lib/rankTrainingLabels.js`** (`deriveLabels`); publishes to **`rank.train.samples`** with `{ event: 'rank.training.sample', userId, contentId, labels, polarity, ... }`.
- **Enable:** `KAFKA_ENABLED=true`, `KAFKA_RANK_TRAINING_SAMPLE_CONSUMER_ENABLED=true`; optional `KAFKA_RANK_TRAINING_SAMPLE_GROUP_ID` (default `rank-training-samples`).
- **Orchestrator:** consumer name **`rankTrainingSample`** (include in `EVENT_BUS_CONSUMERS` if not starting all).
- **Labels:** positive — `positive_watch_6s`, `positive_watch_15s`, `positive_complete`, `positive_like`, `positive_comment`, `positive_share`, `positive_follow`, `positive_gift`, `positive_purchase`; negative — `negative_skip_fast`, `negative_not_interested`, `negative_report`, `negative_skip_under_2s` (short `watchTimeMs` on `feed.watch`). Join with **`feed.impression`** / features in the warehouse for full supervised rows.

---

## 6) User & content embeddings / vector retrieval

- **First deploy (no ANN):** affinities + language/region + watch windows in `UserProfileFeatures` / `ContentFeatures`; Mongo topic recall via `getEmbeddingCandidates`; API helper **`nearestContentForUser`** in `packages/api/src/services/feed/vectorRetrieval.js`.
- **Later:** dense vectors (captions, hashtags, audio/visual, sequence) in `embedding[]`; register **`registerVectorRetrievalBackend`** for pgvector / Qdrant / Milvus / Weaviate; **`nearestContentByUserEmbedding`** for pure ANN queries.
- **Doc:** [embedding-and-vector-retrieval.md](./embedding-and-vector-retrieval.md)

---

## 7) Metrics (Part 17 — do not tune blind)

- **Catalog:** [discovery-ranking-metrics.md](./discovery-ranking-metrics.md) — per-stage (recall, filter drop, scores, latency, diversity, HHI) + success / retention / marketplace (warehouse + `feed.*`).
- **Prometheus (API):** `observeFeedPipeline` from `packages/api/src/routes/metrics.js` on each `buildForYouFeed` — `millo_feed_build_duration_seconds`, `millo_feed_candidates_*`, `millo_feed_item_final_score`, `millo_feed_creator_hhi`, `millo_feed_builds_total{cold_user, experiment_bucket}`.

---

## 8) A/B testing hooks (Part 18 — do not hardcode one ranking forever)

- **Assignment:** `packages/api/src/services/experiments.js` — `getExperimentBucket(userId)` (stable 50/50 on char-code sum); **`FEED_RANK_AB_ENABLED=true`** enables `rank_v1` / `rank_v2`; when off, **`control`** arm only (default weights).
- **Weights:** `getRankWeightOverridesForBucket(bucket)` → `context.rankWeightOverrides` into `feedService.buildForYouFeed`; `@millo/discovery` `scoreFeatures(features, overrides)` merges with `DEFAULT_FEED_RANK_WEIGHTS` (`ranker.js`).
- **Telemetry:** `millo_feed_builds_total{experiment_bucket="rank_v1|rank_v2|control|unknown"}`; Kafka `rank.predictions` includes **`experimentBucket`** for warehouse joins.
- **Uplift analysis (warehouse):** compare arms on **watch time**, **retention** (D1/D7/D30), **negative feedback** (`feed.negative`), **monetization** (gifts / commerce events), **creator fairness** (HHI / new-creator exposure from Part 17 metrics doc). See [discovery-ranking-metrics.md](./discovery-ranking-metrics.md) §E.

---

## 9) Related docs

- [Phase 7 — Discovery Engine](./phase-7-discovery-engine.md) — owns ranking APIs and tests shipped today.  
- [Architecture — infrastructure stack](./architecture-infrastructure-stack.md) — Redis feed cache, Kafka discovery ranking worker.

---

*Last updated: Millo 3.0 — recommendation pipeline specification.*
