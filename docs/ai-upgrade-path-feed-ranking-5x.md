# AI upgrade path — Feed ranking 5.1–5.4

Roadmap for evolving **For You / Explore** ranking from deterministic rules toward learned systems.  
This is a **product/engineering ladder**, not a replacement for global Millo phase numbers in `docs/phase-*.md`.  
Production domain: `https://milloapp.com`

**Hard rules (non-negotiable):** Keep learned layers **shadow-first** until explicitly promoted; use **experiments + audit** for any auto-application; respect `AI_OPTIMIZATION_ENABLED` and Phase 16 no-auto-apply guarantees for `@millo/ai-optimization` until architecture deliberately extends it.

---

## Phase 5.1 (NOW) — Rule-based ranking

**Status:** Production baseline.

- **Heuristic ranker:** `packages/discovery/src/ranker.js` (`scoreFeatures`), `featureBuilder.js`, `policyFilter.js`, `postRanker.js`, `businessRules.js`.
- **End-to-end feed:** `packages/discovery/src/feed.service.js` → `buildForYouFeed` (candidates → filter → score → diversify → rules).
- **Simple / realtime path:** `packages/api/src/services/ranking.service.js` + optional A/B `packages/api/src/services/abtest.js`.
- **Experiments:** `packages/api/src/services/experiments.js` (`FEED_RANK_AB_ENABLED`) — weight overrides only, deterministic given inputs.
- **Labels & telemetry:** `FeedEvent` + Kafka `feed.*`, `rank.predictions` — use for offline evaluation before promoting 5.2+.

**Exit criteria for 5.2:** Stable impression → watch → complete funnel; feature store or export job from `FeedEvent` / warehouse; agreed primary metric (e.g. watch time, completion) and guardrails (safety, creator diversity).

---

## Phase 5.2 — Gradient boosting (XGBoost)

**Target:** Train **tabular models** on user × item × context features; serve scores **alongside** or **instead of** part of the heuristic blend.

- **Features:** Reuse and extend `UserProfileFeatures`, `ContentFeatures`, session signals (`X-Session-Events`), and aggregates from `packages/discovery/src/featureBuilder.js` (export same or richer vectors for training).
- **Training:** Offline pipeline (Python/XGBoost or Spark); labels from watch time, completion, skips, negative feedback (see `packages/database/src/schemas/FeedEvent.js` event types).
- **Serving:** Batch or near-real-time score cache (Redis / feature store); **shadow compare** heuristic vs model score on the same slate before any live blend.
- **Promotion:** Start with **small traffic** A/B (`experiments.js` or dedicated model bucket); log every ranking change that affects money or reach to **audit** where applicable.

**Exit criteria for 5.3:** Model beats baseline on offline + online holdout; latency and cost bounded; monitoring for drift and bias.

---

## Phase 5.3 — Deep learning (neural ranking)

**Target:** **Dense / sequence** models (user history, content embeddings, cross-attention or two-tower) for candidate **re-ranking** or **embedding ANN** retrieval.

- **Retrieval:** Today’s stand-in is topic overlap (`packages/discovery/src/candidateGenerator.js` `getEmbeddingCandidates`); 5.3 replaces or augments with **vector ANN** (documented index service only — no new undocumented dependencies).
- **Training:** Supervised or contrastive learning from engagement sequences; **cold start** still needs exploration mix (`packages/discovery/src/coldStart.js`, `exploration.js`).
- **Serving:** GPU inference service or managed inference; strict timeouts and fallbacks to 5.1/5.2.
- **Shadow:** Dual-publish scores vs production order; `@millo/ai-optimization` remains **suggestion-only** unless product adds an explicit, reviewed integration path (Phase 16).

**Exit criteria for 5.4:** Stable neural serving SLOs; reproducible training; fairness / region compliance checks in the loop.

---

## Phase 5.4 — Reinforcement learning (TikTok-level)

**Target:** **Long-horizon** optimization (session watch time, next-day return, creator ecosystem health) with **delayed rewards** and **exploration**.

- **Formulation:** Typically **contextual bandits** or **off-policy RL** from logged bandit feedback (impression / rank → action → reward); full RL stacks need **simulation + strict guardrails**.
- **Infrastructure:** Continuous logging (`feed.*`, sessions), **counterfactual** evaluation, **safeguards** (diversity caps, trust, compliance) must remain **hard constraints** outside the policy (see `businessRules.js`, Phase 9 compliance filters).
- **Reality check:** “TikTok-level” implies massive data, infra, and research headcount — treat 5.4 as a **north star**; ship incremental steps (5.2 → 5.3) with measurable wins first.

**Non-goals until governance is ready:** Unconstrained RL that overrides safety, payouts, or moderation without human-in-the-loop and audit.

---

## Related docs & code

| Topic | Where |
|--------|--------|
| Deterministic ranking + explainability | `docs/phase-7-discovery-engine.md`, `packages/discovery/src/ranking.js`, `explainability.js` |
| Full recommendation pipeline | `docs/discovery-recommendation-pipeline.md` |
| AI shadow optimizer (no auto-apply) | `docs/phase-16-ai.md`, `packages/ai-optimization` |
| Feed metrics / labels | `docs/discovery-ranking-metrics.md`, `FeedEvent`, `GET /analytics/feed-kpis` |
| Parallel roadmap (trust / moderation AI) | `docs/ai-upgrade-path-phase3.md` |

---

*This document is the **item 12 AI upgrade path (ranking 5.1–5.4)** reference; it does not reorder or replace other phase ownership matrices.*
