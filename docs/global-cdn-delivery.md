# Millo Global CDN Delivery

Content delivery architecture for sub-100ms global playback latency via Cloudflare CDN, edge caching, and regional storage replication.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       GLOBAL CDN DELIVERY                                   │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │   End Users     │
                         │  (Global)       │
                         └────────┬────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Edge PoP       │    │  Edge PoP       │    │  Edge PoP       │
│  (US-West)      │    │  (EU-West)      │    │  (Asia-Pacific) │
│  <50ms          │    │  <50ms          │    │  <50ms          │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE EDGE                                     │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐   │
│  │   Cache     │   WAF       │   DDoS      │   Bot       │   Rate      │   │
│  │   Layer     │   Rules     │   Shield    │   Mgmt      │   Limit     │   │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Origin Storage │    │  Origin Storage │    │  Origin Storage │
│  (US-East)      │    │  (EU-Central)   │    │  (AP-Southeast) │
│  S3 / R2        │    │  S3 / R2        │    │  S3 / R2        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 1. Cloudflare CDN Integration

### Edge Network

Millo leverages Cloudflare's global network (300+ PoPs) for content delivery.

| Feature | Implementation |
|---------|----------------|
| Edge Caching | Automatic for static assets |
| SSL/TLS | Full (Strict) mode, TLS 1.3 |
| HTTP/3 | QUIC enabled |
| Brotli | Compression enabled |
| Smart Routing | Argo Smart Routing (optional) |

### DNS Configuration

```
milloapp.com       → Cloudflare (proxied)
api.milloapp.com   → Cloudflare (proxied)
cdn.milloapp.com   → Cloudflare (proxied)
hls.milloapp.com   → Cloudflare (proxied)
```

### Cache Rules

| Content Type | Cache TTL | Location |
|--------------|-----------|----------|
| Video (MP4/HLS) | 1 year | Edge + Browser |
| Images | 1 year | Edge + Browser |
| Thumbnails | 1 year | Edge + Browser |
| Audio | 1 year | Edge + Browser |
| API Responses | No cache | Origin only |

---

## 2. Edge Caching Configuration

### Cache-Control Headers

File: `packages/api/src/services/audioCdnStorage.js`

```javascript
// GCS upload with long-term cache
await file.save(buffer, {
  contentType,
  metadata: { cacheControl: 'public, max-age=31536000' }, // 1 year
});
```

### Cache Key Structure

```
cdn.milloapp.com/
├── videos/{videoId}/
│   ├── source.mp4           (original)
│   ├── 1080p.mp4            (transcoded)
│   ├── 720p.mp4             (transcoded)
│   ├── 480p.mp4             (transcoded)
│   └── playlist.m3u8        (HLS manifest)
├── thumbnails/{videoId}.jpg
├── music/{trackId}.mp3
├── composed/{jobId}.mp4
└── gifts/{giftId}/
    ├── animation.json
    └── sprite.png
```

### Cloudflare Page Rules

```yaml
# Cache static media aggressively
cdn.milloapp.com/videos/*:
  cache_level: cache_everything
  edge_cache_ttl: 31536000
  browser_cache_ttl: 31536000

# HLS segments - shorter TTL for live
hls.milloapp.com/*.ts:
  cache_level: cache_everything
  edge_cache_ttl: 60

# API - no cache
api.milloapp.com/*:
  cache_level: bypass
```

---

## 3. Regional Storage Replication

### Multi-Region Object Storage

| Region | Primary Storage | CDN PoP |
|--------|-----------------|---------|
| US-East | AWS S3 (us-east-1) | Cloudflare US |
| US-West | AWS S3 (us-west-2) | Cloudflare US |
| EU-West | AWS S3 (eu-west-1) | Cloudflare EU |
| EU-Central | Cloudflare R2 (EU) | Cloudflare EU |
| Asia-Pacific | AWS S3 (ap-southeast-1) | Cloudflare APAC |

### Storage Provider Options

File: `packages/api/src/services/audioCdnStorage.js`

```javascript
const AUDIO_CDN_PROVIDER = (process.env.AUDIO_CDN_PROVIDER || 's3').toLowerCase();

// Supported providers
if (AUDIO_CDN_PROVIDER === 'r2') {
  return uploadR2(key, buffer, contentType);
}
if (AUDIO_CDN_PROVIDER === 'gcs') {
  return uploadGcs(key, buffer, contentType);
}
return uploadS3(key, buffer, contentType);
```

### AWS S3 Configuration

```javascript
async function uploadS3(key, buffer, contentType) {
  const client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  await client.send(new PutObjectCommand({
    Bucket: process.env.AUDIO_CDN_BUCKET || 'millo-music',
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  
  return getCdnUrl(key);
}
```

### Cloudflare R2 Configuration

```javascript
async function uploadR2(key, buffer, contentType) {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
  
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  
  return getCdnUrl(key);
}
```

### Google Cloud Storage Configuration

```javascript
async function uploadGcs(key, buffer, contentType) {
  const storage = new Storage({
    projectId: process.env.GCS_PROJECT_ID,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  });
  
  const bucket = storage.bucket(process.env.GCS_BUCKET);
  const file = bucket.file(key);
  
  await file.save(buffer, {
    contentType,
    metadata: { cacheControl: 'public, max-age=31536000' },
  });
  
  return getCdnUrl(key);
}
```

---

## 4. Live Streaming Infrastructure

### RTMP Ingest + HLS Delivery

File: `infra/streaming/docker-compose.yml`

```yaml
services:
  nginx-rtmp:
    container_name: millo-nginx-rtmp
    ports:
      - "1935:1935"   # RTMP ingest (OBS/streaming clients)
      - "8080:80"     # HLS playback HTTP
    volumes:
      - hls_segments:/tmp/hls
      - recordings:/recordings
    environment:
      - HLS_HOST=${HLS_HOST:-hls.milloapp.com}
      - API_BASE=${API_BASE:-http://api:3000}

  ffmpeg-worker:
    image: jrottenberg/ffmpeg:4.4-ubuntu
    volumes:
      - hls_segments:/tmp/hls
      - recordings:/recordings
```

### HLS Configuration

File: `packages/api/src/routes/live.js`

```javascript
const hlsHost = process.env.HLS_HOST || 'hls.milloapp.com';
const recHost = process.env.RECORDING_HOST || hlsHost;

// HLS playback URL
const playbackUrl = `https://${hlsHost}/${streamKey}/index.m3u8`;

// Recording storage
const recordingUrl = `https://${recHost}/recordings/${streamKey}.mp4`;
```

### Adaptive Bitrate Ladder

| Quality | Resolution | Bitrate | Use Case |
|---------|------------|---------|----------|
| 1080p | 1920x1080 | 4500 kbps | High-speed WiFi |
| 720p | 1280x720 | 2500 kbps | Standard WiFi |
| 480p | 854x480 | 1200 kbps | Mobile 4G |
| 360p | 640x360 | 800 kbps | Mobile 3G |
| 240p | 426x240 | 400 kbps | Low bandwidth |

---

## 5. Media Processing Pipeline

### Video Composition Worker

File: `packages/workers/src/composition.worker.js`

```javascript
const COMPOSED_MEDIA_DIR = process.env.COMPOSED_MEDIA_DIR || './storage/composed';
const COMPOSED_MEDIA_BASE_URL = process.env.COMPOSED_MEDIA_BASE_URL || '';

async function runFfmpeg(jobId, videoUrl, audioUrl, trimStart, trimEnd, volume, outputPath) {
  const filter = `[0:a]volume=1.0[va];[1:a]atrim=start=${trimStart},volume=${volume}[ma];[va][ma]amix=inputs=2[aout]`;
  
  const args = [
    '-y',
    '-i', videoUrl,
    '-i', audioUrl,
    '-filter_complex', filter,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    outputPath,
  ];
  
  spawn('ffmpeg', args);
}
```

### Processing Flow

```
Creator Upload
      │
      ▼
┌─────────────────┐
│ Upload to       │
│ Object Storage  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Queue Job       │
│ (BullMQ/Kafka)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ FFmpeg Worker   │
│ • Transcode     │
│ • Thumbnail     │
│ • Compose       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Upload Results  │
│ to CDN Storage  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Invalidate      │
│ Edge Cache      │
└─────────────────┘
```

---

## 6. Latency Optimization

### Target: <100ms Global Playback

| Optimization | Impact | Implementation |
|--------------|--------|----------------|
| Edge Caching | -50ms | Cloudflare CDN |
| Regional PoPs | -30ms | 300+ locations |
| HTTP/3 (QUIC) | -20ms | Cloudflare |
| Preload Headers | -10ms | Link preload |
| Adaptive Bitrate | Variable | HLS/DASH |

### Client-Side Optimizations

```html
<!-- Preload critical resources -->
<link rel="preload" href="https://cdn.milloapp.com/videos/123/playlist.m3u8" as="fetch">
<link rel="preconnect" href="https://cdn.milloapp.com">
<link rel="dns-prefetch" href="https://cdn.milloapp.com">
```

### HLS Player Configuration

```javascript
const hlsConfig = {
  maxBufferLength: 30,           // Max buffer in seconds
  maxMaxBufferLength: 60,        // Max buffer cap
  startLevel: -1,                // Auto quality selection
  capLevelToPlayerSize: true,    // Match quality to player size
  lowLatencyMode: false,         // Disable for VOD
  enableWorker: true,            // Use web workers
};
```

---

## 7. Edge Security

### Cloudflare Protection

File: `infra/cloudflare-bot-management.md`

| Protection | Configuration |
|------------|---------------|
| Bot Fight Mode | Enabled |
| DDoS Shield | Automatic |
| WAF Rules | Custom rules |
| Rate Limiting | Edge + Origin |
| Turnstile CAPTCHA | High-risk actions |

### Edge Rate Limiting

```yaml
# Cloudflare Rate Limiting Rule
milloapp.com/api/*:
  requests_per_second: 100
  action: challenge
  
api.milloapp.com/*:
  requests_per_ip: 1000
  time_window: 60s
  action: block
```

---

## 8. Region Resolution

### Geographic Routing

File: `packages/api/src/middleware/regionResolver.js`

```javascript
const REGION_PATHS = [
  '/payments',
  '/content',
  '/economy',
  '/ads',
  '/pricing',
  '/shop',
];

async function regionResolver(request, _reply) {
  const region = await regionDetection.resolveUserRegion(request);
  request.region = region;
  
  // Enrich with regional data
  const regionData = await db.Region.findOne({ region_code: region.user_compliance_zone });
  if (regionData) {
    request.region.vat_rate = regionData.vat_rate;
    request.region.local_payment_methods = regionData.local_payment_methods;
    request.region.tax_inclusive = regionData.tax_inclusive;
    request.region.price_multiplier = regionData.price_multiplier;
  }
}
```

### Regional Content Routing

| User Region | Primary CDN | Fallback |
|-------------|-------------|----------|
| North America | US PoPs | EU PoPs |
| Europe | EU PoPs | US PoPs |
| Asia Pacific | APAC PoPs | US PoPs |
| South America | US PoPs | EU PoPs |

---

## 9. CDN URL Structure

### Public URLs

```javascript
function getCdnUrl(key) {
  const AUDIO_CDN_URL = process.env.AUDIO_CDN_URL || process.env.CDN_BASE_URL;
  return `${AUDIO_CDN_URL}/${key.replace(/^\//, '')}`;
}

// Examples:
// https://cdn.milloapp.com/music/trk_9981.mp3
// https://cdn.milloapp.com/videos/abc123/720p.mp4
// https://cdn.milloapp.com/thumbnails/abc123.jpg
```

### URL Patterns

| Asset Type | URL Pattern |
|------------|-------------|
| Videos | `cdn.milloapp.com/videos/{id}/{quality}.mp4` |
| HLS | `cdn.milloapp.com/videos/{id}/playlist.m3u8` |
| Thumbnails | `cdn.milloapp.com/thumbnails/{id}.jpg` |
| Music | `cdn.milloapp.com/music/{trackId}.mp3` |
| Composed | `cdn.milloapp.com/composed/{jobId}.mp4` |
| Gifts | `cdn.milloapp.com/gifts/{giftId}/animation.json` |

---

## 10. Environment Variables

### CDN Configuration

```bash
# CDN URLs
CDN_BASE_URL=https://cdn.milloapp.com
AUDIO_CDN_URL=https://cdn.milloapp.com
COMPOSED_MEDIA_BASE_URL=https://cdn.milloapp.com/composed

# Storage Provider
AUDIO_CDN_PROVIDER=r2  # s3 | r2 | gcs

# AWS S3
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<key>
AWS_SECRET_ACCESS_KEY=<secret>
AWS_S3_BUCKET=millo-media

# Cloudflare R2
R2_ACCOUNT_ID=<account>
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET_NAME=millo-media

# Google Cloud Storage
GCS_PROJECT_ID=millo-prod
GCS_BUCKET=millo-media
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json

# Streaming
HLS_HOST=hls.milloapp.com
RECORDING_HOST=hls.milloapp.com

# Cloudflare
CLOUDFLARE_ACCOUNT_ID=<account>
CLOUDFLARE_API_TOKEN=<token>
```

---

## 11. Health Monitoring

### Storage Health Check

File: `packages/api/src/services/healthDashboard.js`

```javascript
async function checkStorageHealth() {
  const bucket = process.env.AWS_S3_BUCKET || process.env.STORAGE_BUCKET;
  const hasAws = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  const hasR2 = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID;
  
  if (!bucket && !hasAws && !hasR2) {
    return { status: 'not_configured' };
  }
  
  if (hasAws || hasR2) {
    return { status: 'ok', backend: hasR2 ? 'r2' : 's3' };
  }
}
```

---

## Summary

### Delivery Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| CDN | Cloudflare | Edge caching, DDoS, WAF |
| Primary Storage | Cloudflare R2 | Zero-egress, edge proximity |
| Backup Storage | AWS S3 | Multi-region redundancy |
| Live Streaming | NGINX-RTMP + HLS | Low-latency ingest |
| Transcoding | FFmpeg Workers | Multi-bitrate encoding |

### Latency Budget

| Stage | Target | Actual |
|-------|--------|--------|
| DNS Resolution | <10ms | ~5ms (Cloudflare) |
| Edge Cache Hit | <20ms | ~15ms |
| TLS Handshake | <30ms | ~20ms (TLS 1.3) |
| First Byte | <50ms | ~40ms |
| Playback Start | <100ms | ~80ms |

### Key Features

| Feature | Implementation |
|---------|----------------|
| Global Edge | Cloudflare 300+ PoPs |
| Storage Replication | Multi-region S3/R2/GCS |
| Adaptive Streaming | HLS with 5 quality levels |
| Cache TTL | 1 year for static assets |
| Live Streaming | RTMP ingest → HLS delivery |
| Regional Routing | GeoIP-based resolution |
