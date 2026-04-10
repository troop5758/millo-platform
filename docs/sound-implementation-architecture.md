# Millo Sound Implementation Architecture

This document describes the **implementation architecture** for the sound/trending system: the five core components and the pipeline from video to leaderboard.

**Key insight:** The platform promotes **sounds**, not just videos. When a sound wins (trends), many videos that use it ride the same trend and get boosted—which massively increases platform engagement. See [viral-sound-engine.md](viral-sound-engine.md#key-insight).

## Pipeline Overview

```
video upload (or stream with sound attached)
     → extract soundId (VideoSound)
     → update sound metrics (ContentEngagement)
     → compute viral score (Sound Ranking Engine)
     → update leaderboard (Redis)
```

Each step is implemented as follows.

---

## 1. Sound Analytics Service

**Role:** Aggregate engagement metrics **per sound** (views, likes, shares, watch time, completion, plays) from video-level data.

**Data sources:**
- **VideoSound** — Links each video to a sound: `videoId`, `soundId`, `creatorId`. So we know which sound each video uses.
- **ContentEngagement** — Per-video (stream) metrics: `viewCount`, `likes`, `shares`, `watchTimeSeconds`, `completionRate`, `playCount`, `regionCounts`.

**Implementation:** The aggregation is performed inside the **trending sounds worker**. It loads all `VideoSound` and all `ContentEngagement` for those videos, then builds a **soundEng** map: for each `soundId`, it sums (or averages) the engagement of all videos that use that sound.

**Location:** `packages/workers/src/trendingSounds.worker.js` — in `computeTrendingScores()`, the loop that builds `soundEng` from `videoToSound` and `engagements`.

**Output (logical):** Per-sound metrics: `video_uses`, `totalViews`, `watchTimeSum`, `shares`, `completionSum`/`completionCount`, `totalPlays`, and (from VideoSound) the set of `creatorId`s per sound. These feed the Sound Ranking Engine and the Creator Diversity Analyzer.

---

## 2. Sound Ranking Engine

**Role:** Compute a **viral score** for each sound from the aggregated metrics, applying weights and thresholds (completion minimum, loop boost, seed boost, fraud exclusion).

**Formula (simplified):**
```
sound_score =
  video_uses × 3 + shares × 4 + avg_watch_time × 5 + completion_rate × 4
  + creator_diversity × 2 + adoption_rate × 6 + loop_boost + seed_boost
```

**Implementation:** Same worker. For each sound that passes **Creator Diversity** and **Completion Rate** minimums and **Anti-Gaming** (fraud_score below threshold), it computes `sound_score` and collects `{ soundId, score }`. Results are sorted by score descending.

**Location:** `packages/workers/src/trendingSounds.worker.js` — `computeTrendingScores()`, the main loop over `bySound` that computes `sound_score` and pushes to `scores`.

**Dependencies:** Uses metrics from Sound Analytics Service, adoption from Sound Adoption Tracker, and diversity from Creator Diversity Analyzer; applies fraud check via `getSoundFraudScore()` before including a sound.

---

## 3. Trending Sound Redis Leaderboard

**Role:** Store and serve the **current ranking** of sounds by viral score so that APIs and the feed can use it without recomputing.

**Implementation:**
- **Global:** Redis ZSET **`trending_sounds`** — member = `soundId`, score = viral score. Updated every 5 minutes by the trending sounds worker (delete + ZADD).
- **Regional:** **`trending_sounds_us`**, **`trending_sounds_brazil`**, **`trending_sounds_india`**, etc. Score = regional view count from `ContentEngagement.regionCounts`.
- **Read path:** `packages/api/src/lib/trendingSoundsRedis.js` — `getTrendingSoundIds()`, `getTrendingSoundIdsForRegion()`, `getSoundViralScore()`, `getSoundViralScoresMap()`.

**Location:** Writer: `packages/workers/src/trendingSounds.worker.js` — `updateTrendingLeaderboard()`. Reader: `packages/api/src/lib/trendingSoundsRedis.js`.

---

## 4. Sound Adoption Tracker

**Role:** Measure **how quickly** a sound is being adopted (new videos using the sound per unit time). Used in the viral score so that fast-growing sounds get amplified.

**Metric:** `adoption_rate` = number of **VideoSound** documents created in the **last 1 hour** for that sound (new videos using the sound per hour).

**Implementation:** In the worker, an aggregation over **VideoSound** with `createdAt >= oneHourAgo`, grouped by `soundId`, gives `adoptionCounts`. This is stored in `adoptionRateBySound` and fed into the ranking formula as `adoption_rate × 6`.

**Location:** `packages/workers/src/trendingSounds.worker.js` — initial `db.VideoSound.aggregate([ { $match: { createdAt: { $gte: oneHourAgo } } }, { $group: { _id: '$soundId', count: { $sum: 1 } } } ])` and the use of `adoption_rate` in the score.

---

## 5. Creator Diversity Analyzer

**Role:** Ensure a sound is used by **enough distinct creators** before it can rank. Prevents one creator from gaming the system by uploading many videos with the same sound.

**Metric:** `creator_diversity` = number of distinct **creatorId**s in **VideoSound** for that sound (`unique_creator_count`).

**Rules:**
- A sound is **excluded** from the trending leaderboard if `creator_diversity < CREATOR_DIVERSITY_MIN` (default 20).
- The same minimum is applied in **early viral detection** so that only sounds with sufficient creator spread can enter the viral candidates pool.

**Implementation:** When building `bySound`, we also build **creatorIdsBySound** (Map of soundId → Set of creatorId). For each sound, `creator_diversity = creatorIdsBySound.get(soundId).size`. If below threshold, we `continue` (skip that sound). The same logic exists in `packages/workers/src/earlyViralDetection.worker.js`.

**Location:** `packages/workers/src/trendingSounds.worker.js` — `creatorIdsBySound`, `CREATOR_DIVERSITY_MIN`, and the `if (creator_diversity < CREATOR_DIVERSITY_MIN) continue;` check.

---

## End-to-End Pipeline (Concrete)

| Step | What happens | Where |
|------|----------------|------|
| **1. Video / stream has sound** | Creator sets sound via **PUT /content/streams/:streamId/sound** (body: `soundId`). A **VideoSound** document is created or updated (`videoId`, `soundId`, `creatorId`). | `packages/api/src/routes/content.js` |
| **2. Extract soundId** | Every video that has a sound has a **VideoSound** row; `soundId` is the link. The worker loads all VideoSound and groups by `soundId` → **bySound**, **creatorIdsBySound**. | `packages/workers/src/trendingSounds.worker.js` — `computeTrendingScores()` |
| **3. Update sound metrics** | Engagement is already stored per **video** in **ContentEngagement** (views, likes, shares, watch time, etc.). The worker **aggregates** these per sound by joining VideoSound → contentId → ContentEngagement → **soundEng** (Sound Analytics Service). | Same worker; aggregation in the same function. |
| **4. Compute viral score** | For each sound: get adoption (Sound Adoption Tracker), creator diversity (Creator Diversity Analyzer), fraud check; then apply the formula (Sound Ranking Engine). Output: sorted list `scores`. | Same worker — main loop and `getSoundFraudScore()`. |
| **5. Update leaderboard** | Worker deletes **trending_sounds** and ZADDs `(score, soundId)` for each sound. Then does the same for each regional key (**trending_sounds_<region>**) using **soundRegionViews**. | `updateTrendingLeaderboard()` in same worker. |

**Schedule:** The **trending-sounds** BullMQ job runs **every 5 minutes** (configured in `packages/workers/src/index.js`). Each run executes the full pipeline: load VideoSound + ContentEngagement + adoption, aggregate (analytics + diversity), rank (ranking engine + fraud), write Redis (leaderboard).

---

## Component Summary

| Component | Responsibility | Implementation location |
|-----------|----------------|-------------------------|
| **Sound Analytics Service** | Aggregate engagement metrics per sound from VideoSound + ContentEngagement | `trendingSounds.worker.js` — soundEng aggregation |
| **Sound Ranking Engine** | Compute viral score from metrics, weights, thresholds; exclude fraud | `trendingSounds.worker.js` — score formula + fraud check |
| **Trending Sound Redis Leaderboard** | Store and serve ranked sound IDs by score (global + regional) | `trendingSoundsRedis.js` (read), `trendingSounds.worker.js` (write) |
| **Sound Adoption Tracker** | Measure new videos per sound in last hour (adoption_rate) | `trendingSounds.worker.js` — VideoSound aggregate by createdAt |
| **Creator Diversity Analyzer** | Enforce minimum distinct creators per sound; exclude low-diversity sounds | `trendingSounds.worker.js` + `earlyViralDetection.worker.js` — creatorIdsBySound + CREATOR_DIVERSITY_MIN |

---

## Viral Sound Worker Example

The worker updates the trending leaderboard by computing a score per sound and writing to Redis. Simplified single-sound pattern:

```js
async function updateSoundScore(soundId) {
  const metrics = await getSoundMetrics(soundId);
  const score =
    metrics.videoUses * 3 +
    metrics.shares * 4 +
    metrics.watchTime * 5 +
    metrics.completionRate * 4 +
    metrics.uniqueCreators * 2;
  await redis.zadd("trending_sounds", score, soundId);
}
```

- **getSoundMetrics(soundId)** — Returns `{ videoUses, shares, watchTime, completionRate, uniqueCreators }` from VideoSound + ContentEngagement for that sound. Implemented in `packages/workers/src/trendingSounds.worker.js`.
- **updateSoundScore(soundId)** — Fetches metrics, computes the score with the weights above, and ZADDs to **trending_sounds**. Exported for on-demand single-sound updates or tests.
- The **batch job** runs the full pipeline (all sounds, with adoption_rate, loop boost, seed boost, fraud/diversity filters) and writes the entire leaderboard; it does not call `updateSoundScore` per sound.

**Worker runs every:** **5 minutes** (BullMQ repeatable job for `trending-sounds` in `packages/workers/src/index.js`).

---

## Related Docs

- [viral-sound-engine.md](viral-sound-engine.md) — Score formula, amplification loop, saturation, anti-gaming, geographic trend.
- [music-library-architecture.md](music-library-architecture.md) — Music catalog, CDN, licenses, picker, attribution.
