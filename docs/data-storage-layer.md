# Millo Data Storage Layer

Polyglot persistence architecture — optimized for different data access patterns.

## Architecture Overview

```
Application Layer
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    DATA STORAGE LAYER                        │
├──────────────┬───────────────┬─────────────┬─────────────────┤
│   MongoDB    │  PostgreSQL   │   Redis     │ Object Storage  │
│  (Document)  │   (ACID)      │  (Cache)    │   (Media)       │
├──────────────┼───────────────┼─────────────┼─────────────────┤
│ • Users      │ • Ledger      │ • Sessions  │ • Videos        │
│ • Profiles   │ • Wallets     │ • Locks     │ • Images        │
│ • Content    │ • Payouts     │ • Rate lim  │ • Thumbnails    │
│ • Messages   │ • Invoices    │ • Feed cache│ • Gifts anim    │
│ • Moderation │ • Tax records │ • Leaderbd  │ • Creator assets│
└──────────────┴───────────────┴─────────────┴─────────────────┘
```

---

## 1. MongoDB (Primary Document Store)

### Configuration
- Location: `packages/database/src/schemas/`
- Connection: `@millo/database` package
- Total Collections: **134+**

### Collection Categories

#### Identity & Auth
| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `User` | User accounts | email, passwordHash, status, roles |
| `Session` | Active sessions | userId, deviceId, token, expiresAt |
| `Profile` | Public profiles | userId, displayName, bio, avatarUrl |
| `DeviceFingerprint` | Device tracking | userId, visitorId, ip, userAgent |
| `LoginAudit` | Login history | userId, ip, success, timestamp |

#### Content & Media
| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `LiveStream` | Live streams | userId, status, streamKey, playbackUrl |
| `PpvContent` | PPV content | creatorId, mediaUrl, basePriceCents |
| `MusicTrack` | Music library | title, artist, audioUrl, genre |
| `VideoSound` | Video-sound links | videoId, soundId, startTime |
| `CompositionJob` | FFmpeg jobs | videoId, audioId, status |

#### Economy & Payments
| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `Wallet` | User wallets | userId, balanceCents, lockedCents |
| `LedgerEntry` | Immutable ledger | sequence, type, amountCents |
| `Transaction` | Transactions | userId, type, amount, reference |
| `Gift` | Gift catalog | name, type, priceCoins, animationUrl |
| `PayoutRequest` | Creator payouts | userId, amount, provider, status |
| `CoinPack` | Purchasable coins | country, price, currency, coins |

#### Social & Messaging
| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `Follow` | Social graph | followerId, followingId |
| `Block` | Blocked users | blockerId, blockedId |
| `DMSession` | Chat sessions | participants[], lastMessage |
| `DMMessage` | Direct messages | sessionId, senderId, content |
| `Notification` | User notifications | userId, title, body, read |

#### Marketplace
| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `Product` | Store products | sellerId, title, priceCents |
| `Auction` | Live auctions | productId, startPrice, status |
| `Order` | Purchase orders | buyerId, sellerId, status |
| `SellerVerification` | Seller KYC | userId, stage, documents |

#### Moderation & Trust
| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `ModerationQueue` | Review queue | contentId, contentType, status |
| `ModerationLog` | Mod actions | moderatorId, action, targetId |
| `DmcaNotice` | DMCA reports | claimantEmail, contentUrl, status |
| `UserStrike` | Policy strikes | userId, reason, expiresAt |
| `FraudEvent` | Fraud flags | userId, type, riskScore |

#### Analytics & Metrics
| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `ContentEngagement` | Engagement stats | contentId, views, likes, shares |
| `BehaviorEvent` | User behavior | userId, eventType, timestamp |
| `PlatformMetric` | System metrics | name, value, timestamp |
| `HashtagTrend` | Trending tags | hashtag, score, timestamp |

### Indexes
All schemas compile indexes via `syncIndexes()` after connect:

```javascript
// packages/database/src/schemas/index.js
async function syncIndexes() {
  const list = Object.values(models);
  await Promise.all(list.map((M) => M.syncIndexes()));
}
```

---

## 2. PostgreSQL (Financial Ledger)

### Purpose
ACID-compliant storage for financial operations requiring double-entry accounting.

### Schema Files
- `packages/database/sql/ledger_optional.sql`
- `packages/database/sql/phase8_sql_economy_migration.sql`
- `packages/database/sql/wallets_gifts_payouts_optional.sql`

### Tables

#### wallets
```sql
CREATE TABLE wallets (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL UNIQUE,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  balance_cents BIGINT NOT NULL DEFAULT 0,
  locked_cents BIGINT NOT NULL DEFAULT 0,
  lifetime_earnings_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### wallet_transactions
```sql
CREATE TABLE wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL, -- credit | debit
  amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  ref_type VARCHAR(64),
  ref_id VARCHAR(128),
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### gift_transactions
```sql
CREATE TABLE gift_transactions (
  id BIGSERIAL PRIMARY KEY,
  sender_id VARCHAR(64) NOT NULL,
  receiver_id VARCHAR(64) NOT NULL,
  stream_id VARCHAR(64),
  amount_cents BIGINT NOT NULL,
  gift_id VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### payouts
```sql
CREATE TABLE payouts (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  provider VARCHAR(32) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  external_id VARCHAR(128),
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### invoices
```sql
CREATE TABLE invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_id VARCHAR(128) NOT NULL UNIQUE,
  user_id VARCHAR(64) NOT NULL,
  creator_id VARCHAR(64),
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'USD',
  tax_amount_cents BIGINT NOT NULL DEFAULT 0,
  tax_region VARCHAR(16),
  vat_rate NUMERIC(10,4) DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'issued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Double-Entry Principle
```
user_wallet   -100 coins
platform_rev  +100 coins
```

---

## 3. Redis (Cache & Real-Time)

### Configuration
- Package: `ioredis`
- Env: `REDIS_URL` or `REDIS_HOST` + `REDIS_PORT`

### Key Patterns

#### Session Storage
```
magic_link:{token} → userId (TTL: 10 min)
```
File: `packages/api/src/lib/magicLinkRedis.js`

#### Distributed Locks
```
lock:ledger:{userId} → 1 (TTL: 5000ms)
```
File: `packages/economy/src/utils/redisLock.js`

```javascript
// Prevent double-spend
await redis.set(`lock:ledger:${userId}`, '1', 'NX', 'PX', 5000);
```

#### Chat Filter
```
chat:banned → SET of banned words
```
File: `packages/api/src/services/moderation/chatFilter.js`

#### Rate Limiting
```
rate:{endpoint}:{userId} → count (TTL: window)
require_captcha:{userId} → 1 (after risk threshold)
```

#### Live Streaming
```
live:viewers:{streamId} → viewer count (INCR/DECR)
live:gift:leaderboard:{streamId} → ZSET (userId → coins)
```

#### Trending & Discovery
```
music:trending → ZSET (soundId → score)
trending_sounds → ZSET (global)
trending_sounds_us → ZSET (regional)
viral_sound_candidates → SET
```

### Redis Operations Summary

| Operation | Key Pattern | Command | Purpose |
|-----------|-------------|---------|---------|
| Auth | `magic_link:{token}` | SETEX/GET/DEL | Magic link tokens |
| Lock | `lock:ledger:{userId}` | SET NX PX | Double-spend prevention |
| Filter | `chat:banned` | SMEMBERS/SADD/SREM | Banned word list |
| Viewers | `live:viewers:{id}` | INCR/DECR | Real-time count |
| Leaderboard | `live:gift:leaderboard:{id}` | ZINCRBY/ZRANGE | Gift rankings |
| Trending | `music:trending` | ZADD/ZREVRANGE | Sound virality |

---

## 4. Object Storage (Media Files)

### Stored Assets
| Type | Examples | Delivery |
|------|----------|----------|
| Videos | Short-form, livestream VOD | CDN (HLS) |
| Images | Profile photos, thumbnails | CDN |
| Thumbnails | Stream previews, video posters | CDN |
| Gift Animations | 2D/3D gift effects | CDN |
| Creator Assets | PPV content, downloads | CDN |
| Audio | Music tracks, sound effects | CDN |

### Supported Providers
- **AWS S3** — Primary cloud storage
- **Cloudflare R2** — S3-compatible, zero egress
- **Backblaze B2** — Cost-effective backup

### URL Patterns
```
cdn.millo.com/videos/{videoId}.mp4
cdn.millo.com/images/{imageId}.jpg
cdn.millo.com/music/{trackId}.mp3
cdn.millo.com/gifts/{giftId}.webm
```

### Schema References
Media URLs stored in MongoDB documents:

```javascript
// LiveStream
playbackUrl: String,    // HLS .m3u8 for viewers
thumbnailUrl: String,   // Stream poster
recordingUrl: String,   // VOD recording

// PpvContent
mediaUrl: String,       // Content file
thumbnailUrl: String,   // Preview image

// MusicTrack
audioUrl: String,       // Audio file
waveform: String,       // Waveform data

// Gift
animationUrl: String,   // Animation file
soundUrl: String,       // Sound effect
```

---

## Data Flow Examples

### 1. Live Gift Transaction
```
User sends gift
       │
       ▼
┌─────────────────┐
│  Redis Lock     │ ← lock:ledger:{userId}
│  (5000ms TTL)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  MongoDB        │     │  Redis          │
│  LedgerEntry    │     │  Leaderboard    │
│  (audit trail)  │     │  (real-time)    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  PostgreSQL     │     │  WebSocket      │
│  gift_txns      │     │  Broadcast      │
│  (ACID)         │     │  (animation)    │
└─────────────────┘     └─────────────────┘
```

### 2. Content Upload
```
Creator uploads video
         │
         ▼
┌─────────────────┐
│  Object Storage │ ← S3/R2/B2
│  (raw file)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MongoDB        │
│  CompositionJob │ ← FFmpeg queue
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Object Storage │ ← Processed video
│  + CDN          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MongoDB        │
│  Content doc    │ ← mediaUrl, thumbnailUrl
└─────────────────┘
```

---

## Connection Management

### MongoDB
```javascript
// packages/database/src/index.js
const mongoose = require('mongoose');

async function connect() {
  await mongoose.connect(process.env.MONGO_URI);
  await syncIndexes();
}
```

### Redis
```javascript
// packages/economy/src/utils/redisLock.js
const Redis = require('ioredis');

const client = REDIS_URL
  ? new Redis(REDIS_URL)
  : new Redis({ host: REDIS_HOST, port: REDIS_PORT });
```

### PostgreSQL (Future)
```javascript
// Planned: packages/database/src/sql/client.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

---

## Best Practices

### 1. Choose the Right Store
| Data Type | Store | Reason |
|-----------|-------|--------|
| User profiles | MongoDB | Flexible schema, fast reads |
| Financial ledger | PostgreSQL | ACID, double-entry |
| Session cache | Redis | Fast TTL, atomic ops |
| Media files | Object Storage | Scalable, CDN delivery |

### 2. Distributed Locks
Always lock financial operations:
```javascript
await withLock(`lock:ledger:${userId}`, async () => {
  // Atomic wallet operation
});
```

### 3. Index Strategy
Create indexes for query patterns:
```javascript
schema.index({ userId: 1, createdAt: -1 });  // User history
schema.index({ status: 1, type: 1 });        // Queue processing
```

### 4. TTL for Ephemeral Data
Use Redis TTL for temporary data:
```javascript
await redis.setex(key, 600, value);  // 10 min expiry
```

---

## Environment Variables

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017/millo

# Redis
REDIS_URL=redis://localhost:6379
# or
REDIS_HOST=localhost
REDIS_PORT=6379

# PostgreSQL (optional)
DATABASE_URL=postgresql://user:pass@localhost:5432/millo

# Object Storage
AWS_S3_BUCKET=millo-media
AWS_REGION=us-east-1
# or
R2_BUCKET=millo-media
R2_ACCOUNT_ID=xxx
```

---

## Summary

| Store | Collections/Tables | Primary Use |
|-------|-------------------|-------------|
| MongoDB | 134+ | Application data |
| PostgreSQL | 5 (optional) | Financial ledger |
| Redis | 10+ key patterns | Cache, locks, real-time |
| Object Storage | N/A | Media files |

This polyglot architecture enables:
- **Flexibility** — Document store for varying schemas
- **ACID Compliance** — SQL for financial integrity
- **Performance** — Redis for sub-millisecond operations
- **Scalability** — CDN for global media delivery
