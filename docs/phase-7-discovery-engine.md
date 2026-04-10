# Phase 7 — Discovery Engine

**Owns:** Shorts ranking, Live ranking, Level weighting, Trust weighting, Shadow-ban logic, Explainability output.  
**Depends on:** Phase 3, Phase 4.

---

## Shorts ranking

- **API:** `rankShorts(items, options)`, `rankShortsWithExplanation(items, options)` — same deterministic engine; explanation includes `source: 'shorts'`.
- **Location:** `packages/discovery/src/ranking.js`, `explainability.js`.

## Live ranking

- **API:** `rankLive(items, options)`, `rankLiveWithExplanation(items, options)` — same engine; explanation includes `source: 'live'`.
- **Location:** `packages/discovery/src/ranking.js`, `explainability.js`.

## Deterministic ranking

- **API:** `rank(items, options)` — same inputs → same order. No randomness.
- **Score:** `score = baseScore + (levelWeight * level) + (trustWeight * trust)`. Sorted by score descending; ties broken by id (stable).

## Level weighting

- **Config:** `LEVEL_WEIGHT` (default 1.0); optional `options.levelWeight`. Higher level increases score.
- **Location:** `packages/discovery/src/constants.js`, `ranking.js`.

## Trust weighting

- **Config:** `TRUST_WEIGHT` (default 0.5); optional `options.trustWeight`. Higher trust increases score. Items may include `trust` (from Phase 3).
- **Location:** `packages/discovery/src/constants.js`, `ranking.js`, `explainability.js`.

## Shadow-ban logic

- Items with `shadowBanned: true` are **excluded** from ranked results when `respectShadowBan !== false` (default). Applied before scoring in `rank()`, `rankWithExplanation()`, `rankShorts()`, `rankLive()`, etc.
- **Location:** `packages/discovery/src/ranking.js`, `explainability.js`.

## Explainability output

- **API:** `rankWithExplanation(items, options)` — each item gets `explanation: { level, levelWeight, levelContribution, trust?, trustWeight?, trustContribution?, baseScore, finalScore, shadowBanned, source? }`. `source` set for `rankShortsWithExplanation` / `rankLiveWithExplanation`.
- **Location:** `packages/discovery/src/explainability.js`.

## Item shape

- Input items: `{ id?, _id?, baseScore?, level?, trust?, shadowBanned? }`. Other fields preserved in output.

## Validation

- **Shadow ban:** Excluded items do not appear in results. **Level/trust weighting:** Higher level or trust ranks higher when others equal. **Shorts/Live:** rankShorts and rankLive produce same order as rank; explainability includes source.
- Unit tests: `packages/discovery/src/ranking.test.js`.

Run: `node --test packages/discovery/src/ranking.test.js` or `npm run validate:phase7`.

---

## For You feed API

- **`GET /feed/for-you?limit=20`** — Bearer session; `packages/api/src/routes/feed.js`. Uses `@millo/discovery` `feedService.buildForYouFeed`; `Block` → `blockedCreatorIds`; optional Kafka `rank.predictions` (`emitFeedEvent`) includes **`experimentBucket`** when A/B enabled. Set **`FEED_FOR_YOU_ENABLED=false`** to disable (503). **A/B ranking:** `packages/api/src/services/experiments.js` + **`FEED_RANK_AB_ENABLED=true`** → `rank_v1` / `rank_v2` weight overrides in heuristic ranker; default off = `control`. **Session boosts:** pass `recentEvents` via **`X-Session-Events`** header (JSON array of `{ eventType, topic?, type? }`) or POST body `{ recentEvents }`; `deriveSessionBoosts` → `pair_session_topic_boost` / `pair_session_type_penalty`.
- **POST `/feed/events/impression|watch|engagement|negative`** — Bearer session; writes **`FeedEvent`**, emits **`feed.*`** via `emitFeedEvent`. Disable: **`FEED_EVENTS_ENABLED=false`**. See [feed-reference-stack.md](./feed-reference-stack.md).

## Full recommendation pipeline (TikTok-style)

Phase 7 ships **deterministic** ranking plus **multi-signal** discovery scoring (`rankingEngine.js`, `feedGenerator.js`). A production For-You stack is a **multi-stage pipeline** (candidates → safety → fast rank → rerank → diversity → rules → feedback loops), not a single model.

- **Architecture & objective function:** [discovery-recommendation-pipeline.md](./discovery-recommendation-pipeline.md)  
- **Canonical server tree (facades):** [server-feed-directory-layout.md](./server-feed-directory-layout.md) — `packages/api/src/server/models|services/feed|routes` maps to your `server/` mental model.  
- **Multi-objective score helper:** `packages/discovery/src/multiObjectiveRanker.js` — `computeFinalFeedScore(signals)` (weights match the doc; tune via experiments).

---

*Phase 7 complete. Proceed to next phase in specified order.*
