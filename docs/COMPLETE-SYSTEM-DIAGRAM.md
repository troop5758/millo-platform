# Complete System Diagram — Millo Live + Gifts + Fraud

End-to-end flow from viewer to persistence, and why TikTok-style layer separation scales to millions of interactions per second. https://milloapp.com

---

## 1. System Flow (High-Level)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VIEWER (Browser / App)                          │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REACT UI (Web / Mobile)                             │
│   LiveChat · GiftPanel · EmojiRain · StreamPlayer · Moderation · Leaderboard │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ WebSocket + REST
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        WEBSOCKET GATEWAY (API)                               │
│   /live/ws · auth · room routing · fan-out · mod commands                    │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  CHAT SERVICE   │         │ REACTION SERVICE│         │  GIFT SERVICE    │
│  send_message   │         │ live_reaction   │         │  send_gift       │
│  chat_delete   │         │ reaction_burst  │         │  economy.debit   │
│  StreamComment │         │ rate limit      │         │  leaderboard     │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     REDIS (Live Counters & State)                            │
│   live:reactions:{streamId}  live:gift:leaderboard:{streamId}                │
│   live:mod:{streamId}  live:viewers  reaction rate limit  token bucket       │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      KAFKA / RABBITMQ (Event Bus)                            │
│   gift_sent · reaction_burst · chat · stream_lifecycle · fraud_events        │
│   (Optional: async wallet, analytics, audit)                                 │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ WALLET PROCESSOR│         │ FRAUD DETECTION │         │  ANALYTICS      │
│ LedgerEntry     │         │ velocity · IP   │         │  stream rank    │
│ CreatorWallet   │         │ multi-account   │         │  leaderboards   │
│ coins debit/   │         │ circular gifts  │         │  retention       │
│ credit          │         │ FraudEvent      │         │  discovery      │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SQL + MONGODB                                        │
│   MongoDB: LedgerEntry, StreamComment, LiveStream, User, FraudEvent,        │
│            PayoutRequest, PaymentTransaction, ModerationLog                  │
│   SQL (optional): wallets, gift_transactions, payouts                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Why TikTok’s System Scales: Three Layers

TikTok (and similar platforms) scale by **separating concerns** into three layers. Each layer can scale and evolve independently.

| Layer | Store | Purpose | Scale characteristic |
|-------|--------|---------|----------------------|
| **Realtime** | **Redis** | Counters, leaderboards, rate limits, session state, pub/sub | Sub-ms reads/writes; millions of ops/sec per cluster |
| **Money** | **SQL** (optional) | Wallets, gift_transactions, payouts; strong consistency, reporting | ACID; batch and reporting; lower QPS than realtime |
| **Analytics** | **Kafka** | Event stream: gifts, reactions, chat, fraud; async processing | Append-only; back-pressure; replay; millions of events/sec |

**Why it works**

- **Realtime layer (Redis):** All “right now” state lives in Redis. No heavy DB writes on every reaction or gift tick. Leaderboards and viewer counts are Redis-native (ZSET, HASH, INCR). This is what allows millions of live interactions per second.
- **Money layer (SQL):** When you need durable, auditable money movement, a relational store gives strong consistency and clear audit trails. Millo uses MongoDB for ledger today; optional SQL schema exists for `wallets`, `gift_transactions`, `payouts` when you want a dedicated money store.
- **Analytics layer (Kafka):** Events flow into Kafka (or RabbitMQ). Workers consume asynchronously: fraud checks, wallet updates, ranking, retention. The API stays fast; heavy work is decoupled and scalable.

**Millo mapping**

- **Realtime:** `reactionCounters`, `giftLeaderboard`, `streamModeration`, `reactionBurst`, rate limits → Redis.
- **Money:** `LedgerEntry`, `CreatorWallet`, `PaymentTransaction`, `PayoutRequest` → MongoDB (and optionally SQL per `packages/database/sql/`).
- **Analytics:** `fraudCheck.worker`, `FraudEvent`, discovery/ranking, audit logs; can be fed by Kafka when you introduce the event bus (see `docs/SCALING-MILLIONS-VIEWERS.md`).

---

## 3. Six Core Modules (Millo Implementation)

These six modules are the core of a TikTok-style live + gifts platform. Below is how they map in Millo.

### 1️⃣ Realtime Reaction Engine

- **Role:** Ingest reactions at scale, aggregate, and broadcast bursts (e.g. “50 🔥”) instead of 50 single events.
- **Millo:**  
  - **Redis:** `live:reactions:{streamId}` (HASH, emoji → count).  
  - **API:** `packages/api/src/lib/reactionCounters.js`, `packages/api/src/lib/reactionBurst.js`.  
  - **WS:** `live_reaction` → increment counter + mark stream active; burst job publishes `reaction_burst`.  
- **Docs:** Database design: Redis reaction counters; scaling doc: Realtime Gateway + Redis.

### 2️⃣ Gift Wallet System

- **Role:** Deduct sender balance, credit creator share, persist ledger, update creator wallet; optional SQL for wallets/payouts.
- **Millo:**  
  - **Economy:** `@millo/economy` — `coins.debit` / `coins.credit`, `creatorWallet.creditCreator`, `gifts.sendGift` / `reverseGift`.  
  - **Persistence:** MongoDB `LedgerEntry`, `CreatorWallet`; optional SQL `wallets`, `gift_transactions`, `payouts` in `packages/database/sql/wallets_gifts_payouts_optional.sql`.  
- **Docs:** `docs/DATABASE-DESIGN.md` (MongoDB + optional SQL).

### 3️⃣ Gift Animation Engine

- **Role:** Prioritize animations by tier (common → small overlay, epic → large, legendary → full-screen) to avoid spam and keep UX clear.
- **Millo:**  
  - **Web:** `packages/web/src/components/GiftPanel.jsx` — `GIFT_ANIMATION_PRIORITY`, `getAnimationPriority`, `GiftFloaters`; priority queue in `StreamPlayerPage` / `LiveNowPage`.  
  - **API:** `GET /content/gifts` exposes `tier` and `animationPriority`.

### 4️⃣ Redis Leaderboard

- **Role:** Per-stream, real-time “top gifters” with minimal latency.
- **Millo:**  
  - **Redis:** `live:gift:leaderboard:{streamId}` (ZSET; member = userId, score = coins).  
  - **API:** `packages/api/src/lib/giftLeaderboard.js` (ZINCRBY on gift; ZREVRANGE for top N); `GET /live/stream/:streamId/leaderboard`.  
- **Docs:** Database design: Redis gift leaderboard.

### 5️⃣ Fraud Detection Layer

- **Role:** Block or review high-risk gifts and payments (velocity, multi-account, circular gifts, IP, device).
- **Millo:**  
  - **API:** `packages/api/src/services/fraudService.js` — gift velocity, multi-account (device fingerprint), circular gifts, IP reputation, risk score; `FraudEvent` on block.  
  - **Workers:** `packages/workers/src/fraudCheck.worker.js` for async checks.  
  - **Live:** Velocity block triggers `FraudEvent`; 2FA/large gifts; gift reversal (admin) and audit.  
- **Docs:** Phase 11 fraud; anti-fraud gaps addressed in live flow.

### 6️⃣ Stream Ranking Engine

- **Role:** Rank live streams for discovery (e.g. gifts + viewers + chat).
- **Millo:**  
  - **Discovery:** `packages/discovery/src/feedGenerator.js` — `streamRankingScore = giftsValue + viewerCount + chatActivity`; `packages/discovery/src/streamRanking.js` (`computeStreamScore`).  
  - **API:** `retentionService.getTopStreams`, `getTopSupporters`; `GET /marketing/leaderboard/streams`, `GET /marketing/leaderboard/supporters`.  
- **Docs:** Ranking formula in discovery/streamRanking.

---

## 4. TikTok-Level Advanced Fraud (What TikTok Uses)

These are the kinds of systems that make a live-gift platform safe at scale. Millo already implements some; others are targets for enhancement.

| System | Purpose | Millo status | Notes |
|--------|---------|-------------|--------|
| **AI gift spam detection** | Detect bot-like or scripted gift patterns (timing, amount, repetition). | Partial | Velocity + rate limits + cooldown; can add ML/pattern scoring on event stream. |
| **Whale spender detection** | Identify very large spenders for support, compliance, and anti–money laundering. | Partial | High-amount thresholds and risk scoring exist; can add dedicated whale tier and alerts. |
| **Gift laundering prevention** | Stop “send to creator → creator refunds / kicks back” or circular flows. | ✅ | Circular gift check (receiver→sender in 24h); gift reversal + audit; admin reverse API. |
| **Multi-account abuse detection** | Same device/fingerprint used by many accounts (farms, sock puppets). | ✅ | `checkMultiAccount` by device fingerprint; blocks when accounts per fingerprint exceed threshold. |
| **Creator gift farming prevention** | Creators (or colluders) inflating gifts with fake accounts or self-gifts. | Partial | Circular detection + multi-account; can add “same IP creator + sender” and creator-side velocity. |

**Why these matter**

- **Realtime layer** stays fast (Redis) while **fraud** runs on events (sync in API + async in workers/Kafka).
- **Money layer** stays consistent (ledger + optional SQL) and auditable (reversals, FraudEvent, AdminAuditLog).
- **Analytics layer** (Kafka + workers) can run heavier models (spam, whale, farming) without blocking the live path.

Implementing the full “TikTok-level” set means:

- Feeding gift/reaction/chat events into Kafka (or equivalent).
- Fraud workers consuming that stream for: pattern-based spam scoring, whale tagging, and creator-side farming rules.
- Keeping Redis for realtime counters and leaderboards; SQL/Mongo for money and audit; Kafka for analytics and ML.

---

## 5. Summary Diagram (Layers Only)

```
                    ┌──────────────────────────────────────┐
                    │           REALTIME LAYER              │
                    │   Redis · Counters · Leaderboards     │
                    │   Rate limits · Mod state · Pub/Sub   │
                    └──────────────────┬───────────────────┘
                                       │
                    ┌──────────────────▼───────────────────┐
                    │             MONEY LAYER               │
                    │   MongoDB Ledger · CreatorWallet      │
                    │   Optional: SQL wallets, payouts      │
                    └──────────────────┬───────────────────┘
                                       │
                    ┌──────────────────▼───────────────────┐
                    │           ANALYTICS LAYER              │
                    │   Kafka / RabbitMQ · Workers          │
                    │   Fraud · Ranking · Audit · Retention   │
                    └───────────────────────────────────────┘
```

**References**

- **Scaling:** `docs/SCALING-MILLIONS-VIEWERS.md`  
- **Data model:** `docs/DATABASE-DESIGN.md`  
- **Live flow:** `packages/api/src/routes/live.js`  
- **Fraud:** `packages/api/src/services/fraudService.js`  
- **Economy:** `packages/economy`  
- **Discovery / ranking:** `packages/discovery/src/feedGenerator.js`, `streamRanking.js`
