# Millo Media Processing Pipeline

Video and audio processing architecture for short-form content, live streaming, and VOD.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         MEDIA PROCESSING PIPELINE                          │
└────────────────────────────────────────────────────────────────────────────┘

Creator Upload
      │
      ▼
┌─────────────┐
│ API Gateway │ ─── Validate, authenticate, rate limit
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│           MESSAGE QUEUE                 │
│  (Kafka / RabbitMQ / BullMQ)            │
├─────────────────────────────────────────┤
│  Topics/Queues:                         │
│  • composition      (video+audio mix)   │
│  • transcoding      (multi-bitrate)     │
│  • thumbnails       (frame extraction)  │
│  • live-events      (stream events)     │
│  • trending-sounds  (viral scoring)     │
└──────────────┬──────────────────────────┘
               │
       ┌───────┼───────┐
       │       │       │
       ▼       ▼       ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ FFmpeg   │ │ FFmpeg   │ │ Thumbnail│
│ Worker 1 │ │ Worker 2 │ │ Worker   │
└────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │
     └────────────┼────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         OBJECT STORAGE                  │
│  (S3 / Cloudflare R2 / Backblaze B2)    │
├─────────────────────────────────────────┤
│  /videos/{id}/                          │
│    ├── source.mp4                       │
│    ├── 1080p.mp4                        │
│    ├── 720p.mp4                         │
│    ├── 480p.mp4                         │
│    └── playlist.m3u8  (HLS)             │
│  /thumbnails/{id}.jpg                   │
│  /composed/{id}.mp4                     │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│              CDN                        │
│  (Cloudflare / AWS CloudFront)          │
├─────────────────────────────────────────┤
│  cdn.millo.com/videos/...               │
│  cdn.millo.com/thumbnails/...           │
│  Edge caching, adaptive bitrate         │
└─────────────────────────────────────────┘
```

---

## 1. Queue System

### BullMQ Queues (Redis-backed)

File: `packages/workers/src/queues.js`

```javascript
const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
};

// Media processing queues
const compositionQueue = new Queue('composition', { connection });
const trendingSoundsQueue = new Queue('trending-sounds', { connection });
const liveEventsQueue = new Queue('live-events', { connection });

// Additional queues
const trustDecayQueue = new Queue('trust-decay', { connection });
const payoutRetryQueue = new Queue('payout-retry', { connection });
const fraudCheckQueue = new Queue('fraud-check', { connection });
const earlyViralDetectionQueue = new Queue('early-viral-detection', { connection });
const clusterPropagationQueue = new Queue('cluster-propagation', { connection });
```

### Kafka/RabbitMQ Event Bus

File: `packages/api/src/services/eventBus.js`

```javascript
const TOPICS = {
  PAYMENTS: 'payments',
  LIVE_EVENTS: 'live_events',
  MODERATION: 'moderation',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  FRAUD: 'fraud',
  USER_ACTIVITY: 'user_activity',
  AUTH_EVENTS: 'auth_events',
};

// Produce event
await eventBus.publish('live_events', {
  type: 'stream_started',
  streamId,
  userId,
});
```

Backend selection (auto-detect):
```javascript
function getBackend() {
  if (process.env.EVENT_BUS === 'rabbitmq' && process.env.RABBITMQ_URL)
    return require('./rabbitmqEventBus');
  return require('./kafkaEventBus');
}
```

---

## 2. FFmpeg Workers

### Composition Worker (Video + Audio Mix)

File: `packages/workers/src/composition.worker.js`

**Purpose**: Combine creator video with music track.

**Job Data**:
```javascript
{
  jobId: ObjectId,      // CompositionJob _id
  videoUrl: String,     // Source video URL
  audioUrl: String,     // Music track URL
  trimStart: Number,    // Audio start (seconds)
  trimEnd: Number,      // Audio end (seconds)
  volume: Number,       // Music volume (0–2)
}
```

**FFmpeg Pipeline**:
```javascript
function buildFilterComplex(trimStart = 0, trimEnd = null, volume = 1) {
  const trimEndArg = trimEnd != null && trimEnd > trimStart ? `:end=${trimEnd}` : '';
  const vol = Math.max(0, Math.min(2, Number(volume) || 1));
  return `[0:a]volume=1.0[va];[1:a]atrim=start=${trimStart}${trimEndArg},volume=${vol}[ma];[va][ma]amix=inputs=2:duration=first[aout]`;
}

// FFmpeg command
const args = [
  '-y',
  '-i', videoUrl,           // Input video
  '-i', audioUrl,           // Input audio (music)
  '-filter_complex', filter, // Audio mix filter
  '-map', '0:v',            // Map video stream
  '-map', '[aout]',         // Map mixed audio
  '-c:v', 'copy',           // Copy video codec
  '-c:a', 'aac',            // AAC audio codec
  '-b:a', '128k',           // Audio bitrate
  '-shortest',              // End at shortest stream
  outputPath,
];
```

**Job Schema** (`CompositionJob`):
```javascript
{
  userId: ObjectId,
  videoId: ObjectId,      // ref: LiveStream
  audioId: ObjectId,      // ref: MusicTrack
  trimStart: Number,      // seconds
  trimEnd: Number,        // seconds
  volume: Number,         // 0–2 multiplier
  status: 'pending' | 'processing' | 'completed' | 'failed',
  videoUrl: String,
  audioUrl: String,
  outputUrl: String,      // Result CDN URL
  error: String,
}
```

### Transcoding (Multi-Bitrate)

**Output Formats**:
| Resolution | Bitrate | Use Case |
|------------|---------|----------|
| 1080p | 5000 kbps | Full HD devices |
| 720p | 2500 kbps | Standard HD |
| 480p | 1000 kbps | Mobile/low bandwidth |
| HLS | Adaptive | Dynamic switching |

**Example FFmpeg Commands**:
```bash
# 1080p
ffmpeg -i source.mp4 -vf scale=1920:1080 -c:v h264 -b:v 5000k -c:a aac -b:a 192k output_1080p.mp4

# 720p
ffmpeg -i source.mp4 -vf scale=1280:720 -c:v h264 -b:v 2500k -c:a aac -b:a 128k output_720p.mp4

# 480p
ffmpeg -i source.mp4 -vf scale=854:480 -c:v h264 -b:v 1000k -c:a aac -b:a 96k output_480p.mp4

# HLS Adaptive Streaming
ffmpeg -i source.mp4 \
  -filter_complex "[0:v]split=3[v1][v2][v3];[v1]scale=1920:1080[v1out];[v2]scale=1280:720[v2out];[v3]scale=854:480[v3out]" \
  -map "[v1out]" -map 0:a -c:v h264 -b:v:0 5000k -c:a aac -b:a:0 192k \
  -map "[v2out]" -map 0:a -c:v h264 -b:v:1 2500k -c:a aac -b:a:1 128k \
  -map "[v3out]" -map 0:a -c:v h264 -b:v:2 1000k -c:a aac -b:a:2 96k \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  -master_pl_name playlist.m3u8 \
  -f hls -hls_time 6 -hls_list_size 0 \
  -hls_segment_filename "segment_%v_%03d.ts" \
  stream_%v.m3u8
```

### Thumbnail Generation

**Frame Extraction**:
```bash
# Single thumbnail at 1 second
ffmpeg -i video.mp4 -ss 1 -vframes 1 -vf scale=640:360 thumbnail.jpg

# Multiple thumbnails (sprite sheet)
ffmpeg -i video.mp4 -vf "fps=1/10,scale=160:90,tile=10x10" sprite.jpg
```

---

## 3. Worker Deployment

### Docker Configuration

File: `packages/workers/Dockerfile`

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/workers/package.json ./packages/workers/
COPY packages/database/package.json ./packages/database/

RUN npm ci --ignore-scripts --omit=dev

# FFmpeg for video+audio composition
RUN apk add --no-cache ffmpeg

COPY packages/workers/ ./packages/workers/
COPY packages/database/ ./packages/database/

ENV NODE_ENV=production
CMD ["node", "packages/workers/src/index.js"]
```

### Worker List

| Worker | Queue | Purpose |
|--------|-------|---------|
| `composition.worker.js` | `composition` | Video + audio mixing |
| `trendingSounds.worker.js` | `trending-sounds` | Viral sound scoring |
| `earlyViralDetection.worker.js` | `early-viral-detection` | Early trend detection |
| `clusterPropagation.worker.js` | `cluster-propagation` | Cross-cluster spread |
| `viewerSyncWorker.js` | `live-events` | Redis ↔ MongoDB sync |
| `botDetectionWorker.js` | `fraud-check` | Anti-bot analysis |
| `paymentChargebackWorker.js` | `payout-retry` | Payment processing |

---

## 4. Live Streaming Pipeline

### Ingest → Playback Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    LIVE STREAMING PIPELINE                       │
└──────────────────────────────────────────────────────────────────┘

Creator (OBS/Mobile)
        │
        │ RTMP/WebRTC
        ▼
┌───────────────────┐
│ Ingest Server     │ ← Stream key validation
│ (Janus/SRS/nginx) │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐     ┌───────────────────┐
│ Live Transcoder   │────▶│ Recording         │
│ (adaptive bitrate)│     │ (VOD archival)    │
└────────┬──────────┘     └────────┬──────────┘
         │                         │
         ▼                         ▼
┌───────────────────┐     ┌───────────────────┐
│ HLS Packager      │     │ Object Storage    │
│ (segment creation)│     │ recordingUrl      │
└────────┬──────────┘     └───────────────────┘
         │
         ▼
┌───────────────────┐
│ CDN Edge          │
│ (global delivery) │
└────────┬──────────┘
         │
         ▼
   Viewer Playback
```

### Stream Schema

```javascript
// packages/database/src/schemas/LiveStream.js
{
  userId: ObjectId,
  status: 'scheduled' | 'live' | 'ended',
  visibility: 'public' | 'private' | 'paid',
  streamKey: String,
  playbackUrl: String,      // HLS .m3u8 URL
  thumbnailUrl: String,     // Stream preview
  recordingUrl: String,     // VOD archive
  recordingDuration: Number, // seconds
  viewerCount: Number,
  peakViewers: Number,
  totalGiftCoins: Number,
}
```

### HLS Adaptive Streaming

**Client Implementation** (Web):

```javascript
// packages/web/src/components/VideoPlayer.jsx
import Hls from 'hls.js';

if (Hls.isSupported()) {
  const hls = new Hls({ 
    enableWorker: true, 
    lowLatencyMode: live 
  });
  hls.loadSource(src);     // .m3u8 URL
  hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    video.play();
  });
} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
  // Safari native HLS
  video.src = src;
}
```

---

## 5. Trending Sounds Engine

### Viral Score Computation

File: `packages/workers/src/trendingSounds.worker.js`

**Formula**:
```
score = (video_uses × 3)
      + (shares × 4)
      + (avg_watch_time × 5)
      + (completion_rate × 4)
      + (creator_diversity × 2)
      + (adoption_rate × 6)
      + loop_boost
      + seed_boost
```

**Thresholds**:
| Metric | Threshold | Effect |
|--------|-----------|--------|
| `CREATOR_DIVERSITY_MIN` | 20 | Min unique creators |
| `COMPLETION_RATE_MIN` | 0.7 | 70% watch completion |
| `LOOP_RATE_THRESHOLD` | 1.2 | Rewatch indicator |
| `LOOP_RATE_BOOST_WEIGHT` | 80 | Massive ranking boost |
| `SEED_PRIORITY_BOOST` | 100 | Platform partner boost |

**Redis Leaderboards**:
```
trending_sounds          → Global ZSET
trending_sounds_us       → US region
trending_sounds_brazil   → Brazil region
trending_sounds_india    → India region
trending_sounds_uk       → UK region
trending_sounds_eu       → EU region
```

**Worker Job**:
```javascript
async function updateTrendingLeaderboard() {
  const { scores, soundRegionViews } = await computeTrendingScores();
  const redis = getRedis();
  
  // Update global leaderboard
  await redis.del(TRENDING_KEY);
  if (scores.length > 0) {
    const args = scores.flatMap(({ soundId, score }) => [score, soundId]);
    await redis.zadd(TRENDING_KEY, ...args);
  }
  
  // Update regional leaderboards
  for (const region of TRENDING_REGIONS) {
    const key = `trending_sounds_${region.slug}`;
    // ... regional scoring
  }
}
```

---

## 6. Content Delivery

### CDN URL Patterns

| Type | Pattern | Example |
|------|---------|---------|
| Short video | `cdn.millo.com/videos/{id}.mp4` | `cdn.millo.com/videos/abc123.mp4` |
| HLS playlist | `cdn.millo.com/videos/{id}/playlist.m3u8` | Adaptive streaming |
| HLS segments | `cdn.millo.com/videos/{id}/segment_*.ts` | Video chunks |
| Thumbnail | `cdn.millo.com/thumbnails/{id}.jpg` | Preview image |
| Composed | `cdn.millo.com/composed/{id}.mp4` | Video + music |
| Music | `cdn.millo.com/music/{id}.mp3` | Audio tracks |
| Gifts | `cdn.millo.com/gifts/{id}.webm` | Gift animations |

### Playback Resolution

```javascript
// API returns appropriate URL based on stream state
function applyPpvGating(stream, userId, unlockedSet) {
  const playbackUrl = stream.playbackUrl ?? stream.meta?.playbackUrl ?? null;
  const isPaid = stream.visibility === 'paid' && (stream.priceCents || 0) > 0;
  const canPlay = !isPaid || isCreator || hasUnlocked;
  
  return {
    streamUrl: stream.status === 'live' ? (canPlay ? playbackUrl : null) : null,
    priceCents: isPaid ? stream.priceCents : null,
    isLocked: isPaid && !canPlay,
  };
}
```

---

## 7. Processing Flow Examples

### Short Video Upload

```
1. Creator uploads video
   │
   ▼
2. API validates (size, duration, format)
   │
   ▼
3. Upload to Object Storage (source.mp4)
   │
   ▼
4. Create CompositionJob (if music selected)
   │
   ▼
5. Queue: composition
   │
   ▼
6. FFmpeg Worker: mix video + audio
   │
   ▼
7. Queue: transcoding (future)
   │
   ▼
8. Generate thumbnails
   │
   ▼
9. Upload outputs to Object Storage
   │
   ▼
10. Update document with CDN URLs
    │
    ▼
11. Publish to feed
```

### Live Stream Recording

```
1. Stream ends
   │
   ▼
2. Ingest server finalizes recording
   │
   ▼
3. Upload raw recording to Object Storage
   │
   ▼
4. Queue: transcoding (multi-bitrate)
   │
   ▼
5. Generate HLS segments
   │
   ▼
6. Update LiveStream.recordingUrl
   │
   ▼
7. Available as VOD replay
```

---

## 8. Environment Variables

```env
# Queue (BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# Event Bus
KAFKA_ENABLED=true
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=millo-api
# or
EVENT_BUS=rabbitmq
RABBITMQ_URL=amqp://localhost:5672

# Storage
COMPOSED_MEDIA_DIR=/app/storage/composed
COMPOSED_MEDIA_BASE_URL=https://cdn.millo.com/composed

# Trending Sounds
CREATOR_DIVERSITY_MIN=20
COMPLETION_RATE_MIN=0.7
LOOP_RATE_THRESHOLD=1.2
LOOP_RATE_BOOST_WEIGHT=80
SEED_PRIORITY_BOOST=100
```

---

## 9. Scaling Considerations

### Horizontal Scaling

| Component | Strategy |
|-----------|----------|
| FFmpeg Workers | Add replicas, partition by job ID |
| BullMQ | Redis Cluster for queue distribution |
| Kafka | Partition topics by stream/user ID |
| Object Storage | Multi-region replication |
| CDN | Edge PoPs for global delivery |

### Performance Targets

| Metric | Target |
|--------|--------|
| Upload → Playback (short) | < 30 seconds |
| Live latency | < 5 seconds (HLS) |
| Thumbnail generation | < 2 seconds |
| Transcoding (1 min video) | < 60 seconds |
| CDN cache hit rate | > 95% |

---

## Summary

| Stage | Technology | Purpose |
|-------|------------|---------|
| Queue | BullMQ + Kafka/RabbitMQ | Job distribution |
| Processing | FFmpeg | Transcode, compose, thumbnail |
| Storage | S3/R2/B2 | Media persistence |
| Delivery | CDN | Global distribution |
| Format | HLS | Adaptive streaming |
| Resolutions | 1080p, 720p, 480p | Multi-bitrate |
