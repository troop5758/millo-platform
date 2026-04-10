# Millo Royalty-Free Music Architecture

## Overview

- **Creator Upload** → **Audio Library API** → **Music Database** → **CDN Streaming**

**Sound implementation pipeline:** Video/stream with sound → extract soundId (VideoSound) → update sound metrics (ContentEngagement) → compute viral score → update Redis leaderboard. The five components (Sound Analytics Service, Sound Ranking Engine, Trending Sound Redis Leaderboard, Sound Adoption Tracker, Creator Diversity Analyzer) are described in [sound-implementation-architecture.md](sound-implementation-architecture.md).

## Core Components

### 1. Music Library Service (API)

- **GET /music** — List/browse tracks (query: limit, offset, genre, license).
- **GET /music/search?q=** — Search by title, artist, tags, genre.
- **GET /music/:id** — Get one track (streamUrl, license, duration).
- **GET /music/licenses** — List license types (e.g. Millo Royalty-Free, CC BY).
- **POST /music** — Create track with external URL (auth: creator or admin). Body: title, artist, audioUrl/streamUrl, licenseId, genre, mood, bpm, tags. Fingerprint computed and stored for dedup.
- **POST /music/upload** — Upload audio file to CDN (S3/R2/GCS) and create track (auth). Multipart: file + optional title, artist, genre. Returns track with **audioUrl** = CDN URL (e.g. `https://cdn.milloapp.com/music/trk_9981.mp3`). Requires **AUDIO_CDN_*** configured.
- **GET /music/admin/tracks** — Admin: list all tracks (including draft/disabled).

### 2. Music Database (MongoDB) — music_tracks catalog

**MusicTrack** (music_tracks) example document:

- **trackId** — Unique id (e.g. `trk_9981`), auto-generated on create.
- **title**, **artist** — Track name and artist.
- **duration** — Length in seconds (also stored as durationSeconds).
- **genre**, **bpm**, **mood** — For discovery and filtering.
- **licenseType** — e.g. `royalty_free` (string).
- **provider** — e.g. `epidemic` (string).
- **audioUrl** — CDN URL (e.g. `cdn.millo.com/music/trk_9981.mp3`); alias streamUrl.
- **waveform** — Optional waveform data string.
- **createdAt** — From timestamps.
- **licenseId** — Optional ref to MusicLicense; **fingerprint**, **tags**, **status**, **uploadedBy**, **meta**.

**Indexes (fast discovery):** genre, mood, bpm, duration; plus status+createdAt, text search.

**MusicLicense** — name, slug, description, url, allowsCommercial, requiresAttribution.

Default licenses are seeded on first run: *Millo Royalty-Free*, *CC BY*.

### 3. Audio CDN Delivery

Music files are stored in **S3**, **Cloudflare R2**, or **Google Cloud Storage** and served via CDN at URLs like:

- **Example:** `https://cdn.milloapp.com/music/trk_9981.mp3`

**Storage service** (`packages/api/src/services/audioCdnStorage.js`):

- **AUDIO_CDN_PROVIDER** — `s3` | `r2` | `gcs` (default: `s3`).
- **AUDIO_CDN_URL** — Base CDN URL (e.g. `https://cdn.milloapp.com`). Delivered URLs are `{AUDIO_CDN_URL}/music/{trackId}.mp3`.
- **AUDIO_CDN_BUCKET** — Bucket name (default: `UPLOAD_BUCKET` or `millo-music`).

**S3:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (or `AUDIO_CDN_ACCESS_KEY_ID`, `AUDIO_CDN_SECRET_ACCESS_KEY`, `AUDIO_CDN_REGION`).

**Cloudflare R2 (S3-compatible):** `R2_ACCOUNT_ID` (or `CLOUDFLARE_ACCOUNT_ID`), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`. Set **AUDIO_CDN_PROVIDER=r2**.

**Google Cloud Storage:** `GCS_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`), `GOOGLE_APPLICATION_CREDENTIALS` (or `GCS_KEY_FILE`), `GCS_BUCKET`. Set **AUDIO_CDN_PROVIDER=gcs**.

**Upload:** **POST /music/upload** (multipart form: audio file + optional fields `title`, `artist`, `genre`). File is uploaded to the configured provider at key `music/{trackId}.{ext}`; the track is created with **audioUrl** = CDN URL. If Audio CDN is not configured, use **POST /music** with **audioUrl** (external URL) instead.

- Track **streamUrl** / **audioUrl** in responses point to the CDN (e.g. `AUDIO_CDN_URL` or `CDN_BASE_URL`).

### 4. Audio Fingerprint & Copyright Protection

- **audioFingerprintService** — Generates a SHA-256–based fingerprint from (streamUrl, title, artist) for dedup.
- **copyrightScanService** — Scans uploads for copyrighted music (AudD, ACRCloud, Pex). If detected and **AUDIO_COPYRIGHT_ACTION=block**, upload is rejected with 403 COPYRIGHT_DETECTED. See [audio-fingerprint-protection.md](audio-fingerprint-protection.md).
- **audioModerationService** — Scans for hate speech and adult audio (OpenAI Whisper+Moderation, Hive AI, AssemblyAI). If flagged, upload is rejected with 403 AUDIO_MODERATION_BLOCKED or AUDIO_MODERATION_REVIEW. See [audio-moderation-layer.md](audio-moderation-layer.md).
- On **POST /music**, fingerprint is computed; if a track with the same fingerprint exists, API returns 409 TRACK_ALREADY_EXISTS.
- Can be extended later with Chromaprint/AcoustID for content ID.

### 5. License Management

- Licenses stored in **MusicLicense**; referenced by **MusicTrack.licenseId**.
- Public **GET /music/licenses** exposes name, slug, url, requiresAttribution for display in the Creator Audio Picker and library UI.

### 6. Creator Sound Attribution

Each video (stream/VOD) can store which sound was used for display as **🎵 Sound: Summer Vibes**.

- **VideoSound** schema: `videoId` (ref LiveStream), `soundId` (ref MusicTrack), `creatorId` (ref User), `startTime`, `duration`. One record per video.
- **PUT /content/streams/:streamId/sound** (auth, owner) — body: `{ soundId, startTime?, duration? }`. Sets or updates attribution.
- **GET /content/streams/:id**, **GET /content/vod/:id**, **GET /content/vod** — responses include `sound: { videoId, soundId, creatorId, startTime, duration, title, artist, soundDisplay: "🎵 Sound: …" }` when set.

### 7. Viral Sound Engine (trending sounds)

- **Viral score formula:** `sound_score = (video_uses × 3) + (shares × 4) + (avg_watch_time × 5) + (completion_rate × 4) + (creator_diversity × 2) + (adoption_rate × 6)`. **adoption_rate** = new videos using sound per hour; high adoption triggers amplification. Sounds compete; high-scoring sounds get pushed in discovery.
- **Terms:** *video_uses* = number of videos using this sound; *avg_watch_time* = average watch time (minutes); *completion_rate* = 0–1 from ContentEngagement; *creator_diversity* = distinct creators (unique_creator_count); *adoption_rate* = new VideoSound count in last 1 hour.
- **Creator diversity boost:** A sound is only ranked if `unique_creators_using_sound >= CREATOR_DIVERSITY_MIN` (default 20). Prevents one creator from gaming the system. Database metric: **unique_creator_count**.
- **Watch-time boost:** A sound is only ranked if `completion_rate >= COMPLETION_RATE_MIN` (default 70%). Metric: `views_that_finish_video / total_views`. High completion → sound gets more exposure.
- **Sound loop behavior:** `loop_rate = total_plays / total_views`. Loop rate > 1.2 indicates rewatch behavior and massively boosts ranking (ContentEngagement.playCount vs viewCount).
- **Cross-cluster propagation:** Sounds spread across interest clusters (dance, comedy, fitness, beauty, gaming, general). Per-cluster trending (**cluster:trending:{cluster}**); top sounds in one cluster are tested in others (**cluster:test:{cluster}**). **GET /music/trending?cluster=X&expand=true**, **GET /music/clusters**. See [viral-sound-engine.md](viral-sound-engine.md).
- **Trending sound leaderboard:** Redis ZSET **trending_sounds** (score = viral_score). Updated **every 5 minutes** by `@millo/workers` trendingSounds worker.
- **GET /music/trending**, **GET /sounds/trending** — return tracks in viral-score order; fall back to newest-first if leaderboard is empty. Optional `?genre=`, `?cluster=`, `?expand=true`.
- **Discovery boost:** Feed (shorts, trending, global) re-ranks items so videos using high viral-score sounds are pushed.
- **Sound amplification loop:** Video → sound attached → engagement collected → score increases → feed recommends those videos → picker shows trending → more creators adopt the sound → sound goes viral.
- **Early viral detection:** First 50–500 videos per sound are watched; signals (avg watch time, rewatches proxy, shares, comment rate, sound reuse rate) feed an early score. If score ≥ threshold, sound enters Redis **viral_sound_candidates**. **GET /music/viral-candidates** returns those tracks. See [viral-sound-engine.md](viral-sound-engine.md).
- **Sound seeding (hidden trick):** Internal flag **MusicTrack.seedPriority**. Platform partners, popular creators, and brand campaigns get sounds with `seed_priority = true`; the algorithm adds **SEED_PRIORITY_BOOST** to trending score and **SEED_PRIORITY_BOOST_EARLY** to early viral score so these sounds are boosted in ranking and viral-candidate pool. **PATCH /music/admin/tracks/:id/seed** (body: `seedPriority`, `seedPriorityReason`). Flag not exposed in public API; admin track list includes `seed_priority`, `seed_priority_reason`, `seed_priority_set_at`. See [viral-sound-engine.md](viral-sound-engine.md).
- **Video-to-sound attribution graph:** Graph linking sound → videos → creators → viewer engagement. **VideoSound** (videoId, soundId, creatorId) + **ContentEngagement** (per stream). **GET /music/:id/attribution-graph** returns sound, paginated videos with creator and engagement per video, and summary (videoCount, creatorCount, totalViews, totalLikes, totalShares, totalWatchTimeSeconds) to measure sound influence. Query: `limit`, `offset`.
- **Sound saturation control:** Prevents feed monotony by capping how much of the feed one sound can occupy. **max_feed_share_per_sound** (default 8%): in shorts/trending/global feeds, after viral boost, **applySoundSaturationCap** limits items per sound to `floor(feedLimit × MAX_FEED_SHARE_PER_SOUND)` (min 1). **MAX_FEED_SHARE_PER_SOUND** (0–1; default 0.08). See [viral-sound-engine.md](viral-sound-engine.md).
- **Anti-gaming system:** **fraud_score** (0–100) per sound from bot views, same IP uploads, coordinated accounts, rapid reuse from same device. If **fraud_score ≥ SOUND_FRAUD_THRESHOLD** (default 60), sound is **removed from trending** and excluded from viral candidates; **FraudEvent** `sound_gaming` is logged. **SOUND_FRAUD_THRESHOLD**, `packages/workers/src/lib/soundFraud.js`. See [viral-sound-engine.md](viral-sound-engine.md).
- **Geographic trend boost:** Sounds can trend regionally. Redis keys **trending_sounds_us**, **trending_sounds_brazil**, **trending_sounds_india**, **trending_sounds_uk**, **trending_sounds_eu**; score = regional view count from **ContentEngagement.regionCounts**. **POST /content/streams/:streamId/view** increments **regionCounts.**<code> when region is available. **GET /music/trending?region=us** (or brazil, india, uk, eu), **GET /music/regions**. Regional popularity can later become global trends. See [viral-sound-engine.md](viral-sound-engine.md).

### 8. Creator Music Upload Program

- **Flow:** artist signup → upload track → license agreement → moderation → publish to catalog. **Revenue:** platform rev share — artists earn when song trends. See [creator-music-upload-program.md](creator-music-upload-program.md).
- **MusicArtist** — application (pending/approved/rejected), license acceptance, revSharePercent. **MusicTrack** — status draft | pending_review | active | rejected; moderation fields; revSharePercent.
- **POST /music/artist/apply**, **GET /music/artist/me**, **POST /music/tracks/:id/submit**, **GET /music/artist/earnings**; admin: **PATCH /music/admin/artists/:id**, **PATCH /music/admin/tracks/:id**.

### 9. Creator Audio Picker

- **SoundPicker** component — Modal: Sponsored and Challenges sections (when available), trending sounds, search. “Use” selects a track and returns it (with streamUrl) to the parent.
- **Go Live** page — “Background music” section: open picker, select track, copy stream URL for use in OBS or streaming software.
- **/music** page — Browse full library, search, select a track to view/copy stream URL.
- **Trending Sound UI** — Discover via: **/sounds/trending** (🔥 Trending Sounds, 🎵 Dance Beats, 🎧 Comedy Sounds, search, region filter), sound search on /music, and **video sound attribution** link ("🎵 Sound: Title") on replay and live stream pages to /music/:id.
- **Creator Incentive Loop** — Creators benefit from using trending sounds (higher reach, more discoverability, follower growth), which drives organic adoption. The feed boost and sound attribution reinforce this; the Trending Sounds page surfaces the benefits in-product. See [viral-sound-engine.md](viral-sound-engine.md).

### 10. Monetization: Sponsored Sounds & Sound Challenges

- **Sponsored sounds** — Brands pay to promote a track. **SponsoredSound** schema: trackId, brandName, startAt, endAt, budgetCents, status, priority. **GET /music/sponsored** (public); admin CRUD at **/music/admin/sponsored-sounds**.
- **Sound challenges** — Brand-paid challenges (e.g. "Nike challenge sound"). **SoundChallenge** schema: trackId, brandName, challengeName, description, startAt, endAt, imageUrl, prizeDescription, rules. **GET /music/challenges** (public); admin CRUD at **/music/admin/challenges**.
- **Brand audio campaigns** — Represented as one or more sponsored sounds or challenges; optional future parent campaign for reporting. See [monetization-music.md](monetization-music.md).

## Flow

1. **Admin/Creator** adds a track via **POST /music** with **streamUrl** (after uploading the file to storage/CDN).
2. **Fingerprint** is computed and stored; duplicate content is rejected.
3. **Creators** browse or search via **GET /music** or **GET /music/search**, pick a track in the **Creator Audio Picker** (or on /music).
4. **streamUrl** is used in OBS or the streaming app as an audio source for **CDN streaming**.

## Future: AI Music Generator

- Creators will be able to generate royalty-free music from a text prompt (e.g. "Lo-fi chill beat 20 seconds"). Example stack: **Meta MusicGen**, **Suno AI**, **Stability Audio**. A stub endpoint **POST /music/ai/generate** returns 501 until the feature is implemented. See [ai-music-generator.md](ai-music-generator.md).

## Config

- **AUDIO_CDN_URL** — Base CDN URL for music (e.g. `https://cdn.milloapp.com`). Fallback: CDN_BASE_URL.
- **AUDIO_CDN_PROVIDER** — `s3` | `r2` | `gcs` for **POST /music/upload** storage backend.
- **AUDIO_CDN_BUCKET** — Bucket name for uploads (default: UPLOAD_BUCKET or millo-music).
- **CDN_BASE_URL** — General CDN; used when AUDIO_CDN_URL is not set.
