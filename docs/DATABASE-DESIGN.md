# Database Design — MongoDB, SQL, Redis

Canonical layout for live, economy, and real-time data. MongoDB is primary; SQL and Redis are used where noted. https://milloapp.com

---

## Overview

| Store | Use case | Collections / keys |
|-------|----------|--------------------|
| **MongoDB** | Persistent documents, ledger, audit | live_messages, live_reactions, stream_sessions, + existing |
| **SQL** | Optional: wallets, gift_transactions, payouts (strong consistency, reporting) | wallets, gift_transactions, payouts |
| **Redis** | Real-time counters, leaderboards, viewer counts | reaction counters, gift leaderboard, live viewer counts |

---

## 1. MongoDB

### live_messages (stream chat)

Stores live stream chat messages. **Implementation:** `StreamComment` (collection: `streamcomments`).

| Field | Type | Index | Description |
|-------|------|-------|-------------|
| _id | ObjectId | — | Primary key |
| streamId | ObjectId (ref LiveStream) | streamId + createdAt | Stream |
| userId | ObjectId (ref User) | userId + createdAt | Sender |
| displayName | String | — | Display name at send time |
| text | String (max 500) | — | Message body |
| deletedAt | Date | — | Soft delete |
| deletedBy | ObjectId | — | Moderator who deleted |
| meta | Mixed | — | Extra payload |
| createdAt, updatedAt | Date | — | Timestamps |

**Indexes:** `(streamId, createdAt)`, `(userId, createdAt)`.

---

### live_reactions (optional audit)

Aggregated reaction counts are in **Redis** (see below). Optionally persist a sample or audit trail in MongoDB.

| Field | Type | Index | Description |
|-------|------|-------|-------------|
| _id | ObjectId | — | Primary key |
| streamId | ObjectId | streamId + createdAt | Stream |
| userId | ObjectId | — | User who reacted (optional for anonymity) |
| emoji | String | — | e.g. 🔥, ❤️ |
| createdAt | Date | — | When |

**Note:** Current implementation uses **Redis only** for reaction counts (`live:reactions:{streamId}` HASH). Add a `live_reactions` collection only if you need durable audit or analytics in MongoDB.

---

### stream_sessions (viewer join/leave)

One document per viewer-session in a stream. **Implementation:** `LiveViewer` (collection: `liveviewers`).

| Field | Type | Index | Description |
|-------|------|-------|-------------|
| _id | ObjectId | — | Primary key |
| streamId | ObjectId (ref LiveStream) | streamId + userId, streamId + joinedAt | Stream |
| userId | ObjectId (ref User) | — | Viewer (null if anonymous) |
| anonymousId | String | — | Anonymous viewer id |
| joinedAt | Date | — | Join time |
| leftAt | Date | — | Leave time (null = still watching) |
| lastHeartbeatAt | Date | — | Last activity |
| createdAt, updatedAt | Date | — | Timestamps |

**Indexes:** `(streamId, userId)`, `(streamId, joinedAt)`.  
**Viewer count:** Count documents with `streamId` and `leftAt: null`. For scale, mirror count in Redis (see below).

---

## 2. SQL (optional)

Use when you need ACID wallets, gift_transactions, or payouts in a relational store (e.g. PostgreSQL). MongoDB remains source of truth unless you migrate; these schemas support dual-write or reporting.

### wallets

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | Surrogate key |
| user_id | VARCHAR(64) | NOT NULL, UNIQUE | User reference (Mongo ObjectId or external id) |
| currency | VARCHAR(8) | NOT NULL, DEFAULT 'USD' | Currency code |
| balance_cents | BIGINT | NOT NULL, DEFAULT 0 | Available balance |
| locked_cents | BIGINT | NOT NULL, DEFAULT 0 | Pending / held |
| lifetime_earnings_cents | BIGINT | NOT NULL, DEFAULT 0 | Creator lifetime earnings |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Indexes:** `UNIQUE(user_id)`, `(currency)`.

---

### gift_transactions

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| sender_id | VARCHAR(64) | NOT NULL | Payer user id |
| receiver_id | VARCHAR(64) | NOT NULL | Creator / recipient |
| stream_id | VARCHAR(64) | | Stream (if live gift) |
| amount_cents | BIGINT | NOT NULL | Coins / cents sent |
| gift_id | VARCHAR(64) | | Gift type id |
| ref_id | VARCHAR(64) | | Idempotency / ledger ref |
| status | VARCHAR(32) | NOT NULL | completed, reversed, failed |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes:** `(sender_id, created_at)`, `(receiver_id, created_at)`, `(stream_id, created_at)`, `(ref_id)`.

---

### payouts

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | BIGSERIAL | PRIMARY KEY | |
| user_id | VARCHAR(64) | NOT NULL | Creator |
| amount_cents | BIGINT | NOT NULL | Payout amount |
| currency | VARCHAR(8) | NOT NULL | |
| provider | VARCHAR(32) | NOT NULL | stripe, paypal, stripe_connect, etc. |
| idempotency_key | VARCHAR(128) | NOT NULL, UNIQUE | Dedup key |
| status | VARCHAR(32) | NOT NULL | pending, processing, completed, rejected, failed, paid |
| approved_by | VARCHAR(64) | | Admin user id |
| approved_at | TIMESTAMPTZ | | |
| paid_at | TIMESTAMPTZ | | |
| external_id | VARCHAR(128) | | Processor payout id |
| meta | JSONB | | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Indexes:** `UNIQUE(idempotency_key)`, `(status, created_at)`, `(user_id, created_at)`.

---

## 3. Redis

Real-time data: counters, leaderboards, viewer counts. TTL where appropriate (e.g. 24h for stream keys).

### Reaction counters

| Key | Type | Command | Description |
|-----|------|---------|-------------|
| `live:reactions:{streamId}` | HASH | HINCRBY, HGETALL | Field = emoji, value = count. Increment on each reaction; burst job reads deltas. |

**TTL:** 24h. **Implementation:** `packages/api/src/lib/reactionCounters.js`.

---

### Gift leaderboard

| Key | Type | Command | Description |
|-----|------|---------|-------------|
| `live:gift:leaderboard:{streamId}` | ZSET | ZINCRBY, ZREVRANGE | Member = userId, score = total coins sent. ZINCRBY on gift; ZREVRANGE 0 N-1 WITHSCORES for top N. |

**TTL:** 24h. **Implementation:** `packages/api/src/lib/giftLeaderboard.js`.

---

### Live viewer counts

| Key | Type | Command | Description |
|-----|------|---------|-------------|
| `live:viewers:count:{streamId}` | String (integer) | INCR, DECR, GET | Current viewer count. INCR on join, DECR on leave (guarded). |
| _or_ `live:viewers:{streamId}` | SET | SADD, SREM, SCARD | Member = userId or sessionId. SCARD = count. SADD on join, SREM on leave. |

**TTL:** 24h. Use when you need a fast, cached viewer count without querying MongoDB `LiveViewer`. Primary source can remain MongoDB; Redis can be updated by the realtime gateway on join/leave.

---

## Summary

| Layer | MongoDB | SQL (optional) | Redis |
|-------|---------|------------------|-------|
| **Live messages** | StreamComment (live_messages) | — | — |
| **Live reactions** | Optional live_reactions (audit) | — | live:reactions:{streamId} (HASH) |
| **Stream sessions** | LiveViewer (stream_sessions) | — | live:viewers:count:{streamId} or live:viewers:{streamId} (SET) |
| **Wallets** | Wallet | wallets | — |
| **Gift transactions** | LedgerEntry + Transaction | gift_transactions | — |
| **Payouts** | PayoutRequest | payouts | — |
| **Gift leaderboard** | — | — | live:gift:leaderboard:{streamId} (ZSET) |

---

*Schema implementations: MongoDB in `packages/database/src/schemas/`; optional SQL in `packages/database/sql/` (see `wallets_gifts_payouts_optional.sql`); Redis in `packages/api/src/lib/` (reactionCounters, giftLeaderboard).*
