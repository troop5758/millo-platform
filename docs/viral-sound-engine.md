# Viral Sound Engine

The algorithm tracks **sound performance** as well as video performance. Every sound receives a **dynamic viral score**; sounds compete, and videos that use high-scoring sounds get pushed in discovery.

## Key insight

The real trick is: **TikTok promotes sounds, not just videos.**

When a **sound** wins (high viral score, trending), **thousands of videos** that use that sound ride the same trend—they all get boosted in discovery. The platform does not only rank individual videos; it ranks sounds, then surfaces the best videos that use those sounds. One winning sound multiplies reach across many creators and clips.

**This massively increases platform engagement:** more content is surfaced, more creators are incentivized to use trending sounds, and the loop reinforces itself. Millo’s viral sound engine (leaderboard, feed boost, attribution, adoption/diversity) implements this same idea—promote sounds, and let many videos benefit from each trending sound.

## Sound Amplification Loop (sound propagation loop)

TikTok-style feedback loop: each step reinforces the next so that strong sounds become viral.

```
Video uploaded
     ↓
Sound used in video
     ↓
Engagement metrics collected
     ↓
Sound score increases
     ↓
More videos using that sound recommended
     ↓
More creators adopt the sound
     ↓
Sound becomes viral
```

| Step | Millo implementation |
|------|----------------------|
| **Video uploaded** | Creator ends a stream (VOD) or goes live. Stream has `recordingUrl` or is live. |
| **Sound used in video** | Creator sets sound via **PUT /content/streams/:streamId/sound** (body: `soundId`, optional `startTime`, `duration`). Stored in **VideoSound** (videoId, soundId, creatorId). |
| **Engagement metrics collected** | **ContentEngagement** per stream: likes, shares, watchTimeSeconds, completionRate. Updated when users like, share, and when watch/completion are recorded. |
| **Sound score increases** | **Trending sounds worker** (every 5 min) aggregates VideoSound + ContentEngagement, computes viral score per sound, writes to Redis ZSET `trending_sounds`. |
| **More videos using that sound recommended** | **applyViralSoundBoost()** in content routes re-ranks shorts/trending/global feed by sound viral score so videos that use high-scoring sounds appear higher. |
| **More creators adopt the sound** | Creator Audio Picker shows **Trending sounds** (ordered by viral score from Redis), **Sponsored**, and **Challenges**. Creators discover and select these sounds for new videos. |
| **Sound becomes viral** | Loop repeats: more video_uses and creator_diversity → higher score → more recommendation → more adoption. |

This is the **sound propagation loop**: the system amplifies sounds that perform well by recommending their videos and surfacing them in the picker, which drives further adoption and engagement.

## Creator Incentive Loop

Creators **benefit from using trending sounds**, which drives **organic adoption**.

| Benefit | How the system delivers it |
|--------|-----------------------------|
| **Higher reach** | Videos that use high viral-score sounds are **boosted in discovery feeds** (shorts, trending, global). `applyViralSoundBoost()` re-ranks feed items so content using trending sounds appears higher, increasing impressions. |
| **More discoverability** | Trending sounds are surfaced in the **Trending Sounds page** and **Sound Picker**; when creators use a trending sound, their video is associated with that sound. Viewers browsing by sound or seeing “🎵 Sound: X” can discover the creator’s content. |
| **Follower growth** | Higher reach and discoverability from boosted placement and sound attribution lead to more profile visits and follows. The loop is self-reinforcing: more creators use trending sounds → more engagement on those sounds → algorithm pushes them more → more creators adopt. |

**Result:** Creators are incentivized to use trending sounds because the algorithm rewards that behavior with greater distribution. This drives organic adoption of the music library and aligns creator success with platform engagement.

## Score formula

```
sound_score =
  (video_uses × 3)
  + (shares × 4)
  + (avg_watch_time × 5)
  + (completion_rate × 4)
  + (creator_diversity × 2)
  + (adoption_rate × 6)
```

| Term | Meaning |
|------|--------|
| **video_uses** | Number of videos (streams/VODs) that use this sound (from VideoSound). |
| **shares** | Sum of shares on those videos (ContentEngagement.shares). |
| **avg_watch_time** | Average watch time in **minutes** (ContentEngagement.watchTimeSeconds). |
| **completion_rate** | Average completion rate 0–1 from ContentEngagement. |
| **creator_diversity** | Number of **distinct creators** using this sound (from VideoSound.creatorId). Database metric: **unique_creator_count**. |
| **adoption_rate** | **New videos using this sound per hour** (count of VideoSound created in the last 1 hour). High adoption triggers algorithm amplification. |

## Creator diversity boost

A sound must spread across **multiple creators** to be amplified:

- **Rule:** `unique_creators_using_sound >= CREATOR_DIVERSITY_MIN` (default **20**).
- **Why:** Prevents one creator from gaming the system (e.g. uploading many videos with the same sound to inflate its score).
- **Database metric:** **unique_creator_count** — count of distinct `VideoSound.creatorId` per sound.
- **Enforcement:** In the trending worker, sounds with `unique_creator_count < CREATOR_DIVERSITY_MIN` are **excluded** from the `trending_sounds` leaderboard. In early viral detection, sounds below the minimum are excluded from `viral_sound_candidates`.
- **Configuration:** **CREATOR_DIVERSITY_MIN** (default 20).

## Watch-time boost

TikTok heavily weights **watch completion**:

- **Metric:** `completion_rate = views_that_finish_video / total_views` (i.e. `completedViews / viewCount` from ContentEngagement, or the average of stored `completionRate` per video when aggregating by sound).
- **Threshold example:** `completion_rate > 70%` (0.7). Sounds below the minimum get **no** exposure in the trending leaderboard or viral candidates.
- **High completion → sound gets more exposure:** Sounds that meet the threshold are ranked and boosted; those that don’t are excluded so low-completion sounds don’t get amplified.
- **Configuration:** **COMPLETION_RATE_MIN** (default 0.7). In the trending worker, sounds with average completion rate below this are excluded. In early viral detection, sounds with aggregate completion rate below this (when viewCount ≥ 10) are excluded from viral_sound_candidates.

## Sound loop behavior

Certain sounds naturally cause **loops** (short beat drop, funny punchline, dance rhythm). Loop signals:

- **rewatch_count** — number of replays (included in **total_plays**).
- **loop_rate = total_plays / total_views**

When **loop_rate > 1.2** it indicates rewatch behavior and **massively boosts ranking**.

- **Metric:** `loop_rate = total_plays / total_views`. ContentEngagement has **viewCount** (total_views) and **playCount** (total play events including rewatches). If playCount is not set, it is treated as viewCount so loop_rate = 1.
- **Threshold:** **LOOP_RATE_THRESHOLD** (default 1.2). Sounds with loop_rate above this get an additive boost: `(loop_rate - 1) × LOOP_RATE_BOOST_WEIGHT` in the trending score, and **LOOP_RATE_BOOST_EARLY** (default 0.25) added to the early viral score (capped at 1).
- **Configuration:** **LOOP_RATE_THRESHOLD**, **LOOP_RATE_BOOST_WEIGHT** (default 80), **LOOP_RATE_BOOST_EARLY** (default 0.25).
- **Data:** To get loop_rate > 1, clients must record each play (including rewatch). Use **POST /content/streams/:streamId/view** once per view (session) to increment viewCount, and **POST /content/streams/:streamId/play** on every play (including replay) to increment ContentEngagement.playCount. **GET /content/streams/:streamId/engagement** returns `views`, `plays`, and `loop_rate`.

## Sound adoption rate

TikTok measures how fast creators adopt a sound:

- **adoption_rate = new_videos_using_sound / hour**
- Example: 200 new videos in 1 hour → high adoption.
- **High adoption triggers algorithm amplification:** the viral score includes `adoption_rate × 6`, so sounds that are being adopted quickly rank higher in the trending leaderboard and get more feed boost. The worker recomputes every 5 minutes using VideoSound documents with `createdAt` in the last hour.

## Sound seeding (hidden trick)

Platforms secretly **seed sounds** through influential creators so the algorithm boosts these early uses. Used for:

- **Platform partners** — exclusive or promoted tracks.
- **Popular creators** — sounds given to top creators to kickstart adoption.
- **Brand campaigns** — sponsored or challenge sounds that need early visibility.

**Internal flag:** `sound.seed_priority = true` (stored as **MusicTrack.seedPriority**). This flag is **not exposed** in public API responses; it is visible only in admin track list and when updating seed status.

**Algorithm boost:**

- **Trending worker:** Sounds with `seedPriority === true` receive an additive **SEED_PRIORITY_BOOST** (default 100) to their viral score before ranking in the `trending_sounds` leaderboard.
- **Early viral detection:** Sounds with `seedPriority === true` receive **SEED_PRIORITY_BOOST_EARLY** (default 0.15) added to their early viral score (capped at 1), making it easier for them to enter the `viral_sound_candidates` pool.

**Admin API:** **PATCH /music/admin/tracks/:id/seed** — body: `{ "seedPriority": true|false, "seedPriorityReason": "platform partner" }`. Optional `seedPriorityReason` and `seedPrioritySetAt` are stored for audit. Admin track list (**GET /music/admin/tracks**) includes `seed_priority`, `seed_priority_reason`, and `seed_priority_set_at` in each track.

**Configuration:** **SEED_PRIORITY_BOOST** (default 100), **SEED_PRIORITY_BOOST_EARLY** (default 0.15).

## Anti-gaming system

To prevent manipulation of the trending and viral-candidate systems, a **fraud_score** (0–100) is computed per sound from these signals:

| Signal | Detection |
|--------|-----------|
| **Bot views** | High view count with very low average watch time (e.g. ≥100 views and &lt;10 s avg watch) → inflated engagement. |
| **Same IP uploads** | Many distinct creators using this sound share the same IP (from **DeviceFingerprint**) → same location / farm. |
| **Coordinated accounts** | Same device fingerprint used by many creators who use this sound → multi-account or coordinated inauthentic behavior. |
| **Rapid reuse from same device** | Many videos using this sound created in the last 24 hours from creators that share the same device fingerprint → automated or farmed reuse. |

**If fraud_score is high:** the sound is **removed from trending** (not written to the `trending_sounds` leaderboard) and **excluded from viral candidates** (not added to `viral_sound_candidates`). Each exclusion is logged as a **FraudEvent** with `eventType: 'sound_gaming'`, `action: 'block'`, `riskScore`, and `signals` for audit.

**Configuration:** **SOUND_FRAUD_THRESHOLD** (default 60). Sounds with `fraudScore >= SOUND_FRAUD_THRESHOLD` are excluded. Implementation: `packages/workers/src/lib/soundFraud.js` (signals and scoring), trending and early-viral workers call `getSoundFraudScore()` before adding a sound to the leaderboard or candidate pool.

## Key idea

- **Sounds compete with each other.** The leaderboard is updated every 5 minutes.
- **If a sound performs well, the system pushes videos using that sound.** In the shorts, trending, and global feeds, each item’s rank is boosted by its sound’s viral score so that high-scoring sounds surface more.

## Implementation

- **Worker:** `packages/workers/src/trendingSounds.worker.js` — aggregates VideoSound + ContentEngagement, computes the formula per sound, writes to Redis ZSET `trending_sounds` (sorted set). **Runs every 5 minutes.** Single-sound example: `getSoundMetrics(soundId)` and `updateSoundScore(soundId)` (see [sound-implementation-architecture.md](sound-implementation-architecture.md#viral-sound-worker-example)).
- **Pipeline & components:** The full flow (video → extract soundId → update sound metrics → compute viral score → update leaderboard) and the five implementation components—**Sound Analytics Service**, **Sound Ranking Engine**, **Trending Sound Redis Leaderboard**, **Sound Adoption Tracker**, **Creator Diversity Analyzer**—are described in [sound-implementation-architecture.md](sound-implementation-architecture.md).
- **Redis:** `packages/api/src/lib/trendingSoundsRedis.js` — `getTrendingSoundIds(limit)`, `getSoundViralScore(soundId)`, `getSoundViralScoresMap(soundIds)` for feed ranking.
- **Feed boost:** After discovery returns items for `shorts`, `trending`, or `global`, the API looks up each video’s sound (VideoSound), gets viral scores from Redis, and re-sorts by `engagementScore + soundViralScore × VIRAL_SOUND_BOOST_WEIGHT` (default 0.15). Applied in `packages/api/src/routes/content.js` via `applyViralSoundBoost()`.

## Configuration

- **VIRAL_SOUND_BOOST_WEIGHT** — Weight applied to the sound’s viral score when boosting feed order (default `0.15`). Increase to push viral sounds more; decrease to rely more on per-video engagement.

## Early Viral Detection (critical)

TikTok watches the **first 50–500 videos** using a sound. If early signals exceed a threshold, the sound enters the **viral candidate** pool and can be surfaced as “Rising” or in the sound picker.

### Signals measured (early window)

| Signal | Source |
|--------|--------|
| **Average watch time** | ContentEngagement.watchTimeSeconds over the first N videos. |
| **Rewatches** | Proxy: (viewCount − completedViews) / viewCount over those videos. |
| **Shares** | Sum of ContentEngagement.shares. |
| **Comment rate** | comments / viewCount over those videos. |
| **Sound reuse rate** | video_uses in window / days since first use (adoption velocity). |

### Threshold and pool

- Only sounds with at least **EARLY_VIRAL_WINDOW_MIN** (default 50) videos in the early window are evaluated.
- The **early window** is the first **EARLY_VIRAL_WINDOW_MAX** (default 500) videos per sound, ordered by VideoSound.createdAt.
- A composite **early viral score** (0–1) is computed from the normalized signals (weighted: avg watch time, rewatch proxy, shares, comment rate, reuse rate).
- If **early viral score ≥ EARLY_VIRAL_THRESHOLD** (default 0.45), the sound is added to the **viral_sound_candidates** Redis sorted set.

### Redis structure

- **Key:** `viral_sound_candidates` (sorted set).
- **Score:** early viral score; **member:** soundId (Mongo ObjectId string).
- Updated every **15 minutes** by the early-viral-detection worker.

### Implementation

- **Worker:** `packages/workers/src/earlyViralDetection.worker.js` — runs on schedule, builds early window per sound, aggregates engagement, computes early score, writes to Redis.
- **API:** `packages/api/src/lib/trendingSoundsRedis.js` — `getViralCandidateIds(limit)`.
- **Endpoint:** **GET /music/viral-candidates** — returns tracks in the viral candidate pool (for “Rising” or picker).

### Configuration

- **EARLY_VIRAL_WINDOW_MIN** — Minimum videos per sound to evaluate (default 50).
- **EARLY_VIRAL_WINDOW_MAX** — Maximum videos in the early window (default 500).
- **EARLY_VIRAL_THRESHOLD** — Minimum early score 0–1 to enter the pool (default 0.45).

## Trending sound leaderboard

Sounds are ranked **globally** in a Redis ZSET:

- **Key:** `trending_sounds`
- **Score:** viral_score (same formula as above).
- **Updated:** every 5 minutes by the trending sounds worker.

**API:** **GET /music/trending** and **GET /sounds/trending** (same response). Query: `limit`, `genre`, `cluster`, `expand`.

## Video-to-sound attribution graph

TikTok-style graph linking **sound → videos → creators → viewer engagement** to measure sound influence.

**Structure:**

```
sound_123 (MusicTrack)
 ├ video_1 (LiveStream) — creator A, engagement (views, likes, shares, watch time)
 ├ video_2 (LiveStream) — creator B, engagement
 ├ video_3 (LiveStream) — creator A, engagement
```

- **Data:** **VideoSound** (videoId, soundId, creatorId, startTime, duration) links each video to a sound and creator. **ContentEngagement** (contentId = stream) holds per-video views, likes, shares, watchTimeSeconds, completionRate.
- **API:** **GET /music/:id/attribution-graph** — `:id` is track `_id` or `trackId` (e.g. `trk_9981`). Query: `limit`, `offset` for paginated videos.
- **Response:** `sound` (track summary), `videos` (array of { videoId, creatorId, creator: { displayName, avatarUrl }, title, thumbnailUrl, engagement: { views, likes, shares, comments, watchTimeSeconds, completionRate, playCount }, startTime, duration, createdAt }), and `summary` (videoCount, creatorCount, totalViews, totalLikes, totalShares, totalWatchTimeSeconds) across **all** videos using this sound. This helps measure sound influence (reach, creator diversity, total engagement).

## Geographic trend boost

Sounds can **trend regionally**; regional popularity can later become global trends.

- **Redis keys:** Per-region leaderboards: **trending_sounds_us**, **trending_sounds_brazil**, **trending_sounds_india**, **trending_sounds_uk**, **trending_sounds_eu**. Score = sum of **regional engagement** (views from that region).
- **Data:** **ContentEngagement.regionCounts** stores per-region view counts (e.g. `{ US: 100, BR: 50 }`). When a view is recorded (**POST /content/streams/:streamId/view**), the request’s region (e.g. `request.region.user_country` or `user_compliance_zone`) is normalized to a region code (US, BR, IN, UK, EU) and `regionCounts.<code>` is incremented. The trending worker aggregates `regionCounts` per sound and writes each region’s ZSET.
- **API:** **GET /music/trending?region=us** (or **brazil**, **india**, **uk**, **eu**) returns tracks from that region’s leaderboard. Falls back to global trending if the regional key is empty. **GET /music/regions** returns the list of supported regions (`code`, `slug`).
- **Worker:** Same run that updates **trending_sounds** also updates **trending_sounds_<slug>** for each region; only sounds that passed global filters (diversity, completion, fraud) are included, ranked by that region’s view count.

## APIs

- **GET /music/trending**, **GET /sounds/trending** — Returns tracks ordered by viral score (from Redis ZSET trending_sounds).
- **GET /music/viral-candidates** — Returns tracks in the early-viral candidate pool (sounds that exceeded the early detection threshold).
- **GET /music/:id/attribution-graph** — Returns the video-to-sound attribution graph for a track (sound + videos with creators + engagement + summary).
- **GET /music/trending?region=us|brazil|india|uk|eu** — Returns trending tracks for that region (from **trending_sounds_<region>**); falls back to global if empty.
- **GET /music/regions** — Returns list of regions supported for geographic trending (`code`, `slug`).
- **GET /content/feed/shorts**, **GET /content/feed/trending**, **GET /content/feed** (global) — Items are re-ordered so that videos using higher viral-score sounds rank higher, all else equal.

## Sound saturation control

If a sound becomes **too dominant**, the platform reduces its exposure to **prevent feed monotony**.

- **Rule:** No single sound may occupy more than **max_feed_share_per_sound** of the feed (default **8%**). Example: for a feed of 50 items, at most 4 slots can be videos that use the same sound.
- **Where:** Applied after viral sound boost on **shorts**, **trending**, and **global** feeds. The API requests a larger pool from discovery, applies viral boost, then **applySoundSaturationCap**: items are taken in rank order, but once a sound has reached its cap (e.g. 4 items for 8% of 50), further videos using that sound are skipped until the feed is filled.
- **Configuration:** **MAX_FEED_SHARE_PER_SOUND** (0–1; default `0.08`). Minimum effective cap is 1 item per sound.

## Cross-cluster propagation

TikTok spreads sounds across **interest clusters**. If a sound performs in one cluster, the system tests it in others.

- **Clusters:** dance, comedy, fitness, beauty, gaming, general (stream **category** or **meta.category** maps to cluster).
- **Architecture:** sound → cluster test → expansion.
  - Per-cluster trending: for each cluster, compute a score per sound (videos in that cluster using the sound + their engagement). Redis: **cluster:trending:{cluster}** (sorted set).
  - **Test expansion:** For each cluster A, take the top **CLUSTER_TOP_PERCENT_FOR_EXPANSION** (default 20%) of sounds. Add those sounds to **cluster:test:{B}** for every other cluster B. So when a user browses cluster B, we can surface “testing” sounds that are top in A.
- **API:** **GET /music/trending?cluster=dance** returns trending for that cluster (from cluster:trending:dance; falls back to global if empty). **GET /music/trending?cluster=dance&expand=true** also returns **testing** — sounds from other clusters we’re testing in dance. **GET /music/clusters** returns the list of cluster slugs.
- **Worker:** `packages/workers/src/clusterPropagation.worker.js` runs every 30 minutes: builds per-cluster scores from VideoSound + LiveStream category + ContentEngagement, writes cluster:trending:* and cluster:test:*.
- **Configuration:** **CLUSTER_TOP_PERCENT_FOR_EXPANSION** (default 20).
