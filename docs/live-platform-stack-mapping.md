# Live Platform Stack & Data Models — Aligned with Millo

This doc maps your proposed stack (Node + WebRTC/RTMP + WebSocket, gifts, discovery, moderation, live commerce) and core data models to **Millo’s existing** backend, real-time systems, and schemas. No new databases or duplicate models are introduced; alignment is done via existing packages and schemas.

---

## 0. Stack alignment

| Your stack | Millo equivalent | Notes |
|------------|-------------------|------|
| **Frontend: React + Tailwind** | ✅ React (packages/web), Tailwind-style CSS vars | Same. |
| **WebRTC player** | HLS playback via `playbackUrl`; ingest can use WebRTC/RTMP | `StreamPlayerPage`, `VideoPlayer`; Janus/FFmpeg in ingest. |
| **Socket.IO client** | **WebSocket** (native `@fastify/websocket`) | Millo uses WS at `/live/ws?streamId=`. Use WS client, not Socket.IO. |
| **Backend: Node.js (Express)** | **Node.js (Fastify)** | Same runtime; Millo uses Fastify in `packages/api`. |
| **MongoDB (live/chat)** | ✅ MongoDB for live, chat, gifts, users | Single MongoDB; no separate “live” DB. |
| **MySQL (users/payments)** | **MongoDB** | Millo uses MongoDB for User, Order, PaymentTransaction, LedgerEntry, etc. No MySQL. |
| **Redis (real-time + cache)** | ✅ Redis | Viewer counts, BullMQ (jobs), optional cache. |
| **Socket.IO (chat/events)** | **WebSocket** | `packages/api` + `packages/live` + sockets: WS for chat, gifts, product drops. |
| **Janus WebRTC (SFU)** | ✅ Janus | `packages/api/src/services/live/janusService.js`. |
| **FFmpeg workers (transcoding)** | Ingest/transcode pipeline | HLS output; FFmpeg in ingest path. |
| **RabbitMQ (jobs)** | **BullMQ** (Redis) | `packages/workers`, `packages/api` (e.g. fraud-check, tracking-support). Use BullMQ, not RabbitMQ. |

---

## 1. Core data models → Millo schemas

### LiveSession → LiveStream + ScheduledStream

Your **LiveSession** fields map to Millo as follows.

| Your field | Millo schema | Location / notes |
|------------|--------------|------------------|
| `creatorId` | `LiveStream.userId` | `packages/database/src/schemas/LiveStream.js` |
| `title` | `LiveStream.title` | Same. |
| `category` | `LiveStream.category` (default `'general'`) | Same. |
| `thumbnail` | `LiveStream.thumbnailUrl` | Same. |
| `status: scheduled \| live \| ended` | `LiveStream.status` | Same enum. |
| `viewers` | `LiveStream.viewerCount` | Same. |
| `peakViewers` | `LiveStream.peakViewers` | Same. |
| `startedAt` / `endedAt` | `LiveStream.startedAt` / `LiveStream.endedAt` | Same. |
| `streamKey` / `playbackUrl` | `LiveStream.streamKey` / `LiveStream.playbackUrl` | Same. |
| `metrics.watchTime` | Not first-class | Can live in `LiveStream.meta` or aggregate from LiveStreamMetrics / analytics. |
| `metrics.chatCount` | Aggregate | From StreamComment count or WS stats. |
| `metrics.giftRevenue` | `LiveStream.totalGiftCoins` | Coins; revenue in LedgerEntry / economy. |

**Scheduled** streams: use **ScheduledStream** (creatorId, title, scheduledStart, status, liveStreamId when started). When the scheduled time is reached, a worker creates/links a **LiveStream** (see `startScheduledStreams.worker.js`).

---

### Chat message → StreamComment (+ WS)

| Your field | Millo schema | Notes |
|------------|--------------|--------|
| `liveId` | `StreamComment.streamId` | Ref `LiveStream`. |
| `userId` | `StreamComment.userId` | Ref `User`. |
| `username` | `StreamComment.displayName` or resolve from User/Profile | Display in chat. |
| `message` | `StreamComment.text` | Max 500 chars. |
| `type: text \| gift \| system` | Not on schema | Use **meta.type** or a separate event over WebSocket. |

- **Text chat**: persisted as **StreamComment** (streamId, userId, text, displayName). History: GET `/live/stream/:streamId/chat`.
- **Gift / system**: Often not stored as full ChatMessage rows; they are real-time events over **WebSocket** (e.g. `gift_sent`, `system`). If you need persistence, use `StreamComment` with `meta.type: 'gift' | 'system'` and `meta.giftId` etc., or keep events ephemeral and rely on LedgerEntry for gift records.

---

### Gift catalog → Gift

| Your field | Millo schema | Notes |
|------------|--------------|--------|
| `name` | `Gift.name` | Same. |
| `priceCoins` | `Gift.priceCoins` or `Gift.cost` | Millo: `cost` (coins), `priceCoins` optional. |
| `animationUrl` | `Gift.animationUrl` | Same. |
| `rarity` | Not on schema | Use **meta.rarity** or **Gift.label** (e.g. "common", "epic", "legendary"). |

Millo **Gift** also has: `id` (string, unique), `type` (2d | 3d | ai), `icon`, `soundUrl`, `active`. Add `rarity` via label or meta if needed.

---

### Gift transaction → LedgerEntry + economy

Millo does **not** have a separate **GiftTransaction** collection. Gifts are recorded as:

- **LedgerEntry**: `refType: 'gift'`, `meta`: { streamId, receiverId, giftId, coins, senderId, … }. Debit for sender, credit for receiver (creator); platform commission via economy.
- **Economy**: `appendEntry` (or equivalent) for coin deduction and creator credit.

So map your **GiftTransaction** fields as follows:

| Your field | Millo equivalent |
|------------|-------------------|
| `liveId` | `LedgerEntry.meta.streamId` (or refId) |
| `senderId` | `LedgerEntry.actorId` (debit) or `meta.senderId` |
| `receiverId` | `LedgerEntry.meta.receiverId` (creator) |
| `giftId` | `LedgerEntry.meta.giftId` |
| `coins` | `LedgerEntry.amountCents` (or coins in meta) / economy |
| `diamonds` | Optional; use meta or a separate ledger type if you introduce diamonds |

Gift send flow: WebSocket `send_gift` → live route validates → economy debit sender, credit creator (and platform) → LedgerEntry with refType `gift` → broadcast `gift_sent` over WS. See `packages/api/src/routes/live.js` (send_gift handling) and fraud checks (e.g. `flagGiftFraud`).

---

## 2. Backend (Node.js + WebRTC/RTMP + WebSocket)

- **HTTP API**: Fastify in `packages/api` (not Express). Live routes: `packages/api/src/routes/live.js` (stream CRUD, WS gateway, chat, gifts).
- **Real-time**: WebSocket at `/live/ws?streamId=`. Chat, gifts, product drops, moderator actions (mute, block gifts, etc.) over WS. No Socket.IO.
- **WebRTC/RTMP**: Janus in `packages/api/src/services/live/janusService.js`; ingest produces HLS; playback via `playbackUrl`.

---

## 3. Real-time systems

- **Viewer count**: Redis (e.g. `viewerCountRedis`) + WS join/leave.
- **Chat**: WS messages + optional persistence in **StreamComment**; history via GET `/live/stream/:streamId/chat`.
- **Gifts**: WS `send_gift` → economy + LedgerEntry → broadcast `gift_sent` to room.
- **Product drops / live commerce**: WS events for product focus; `LiveStream.featuredProductIds`; GET `/shop/creator/:creatorId/live-shopping`.

---

## 4. Gifts + monetization

- **Catalog**: **Gift** model; admin or config-driven.
- **Sending**: WebSocket + economy + LedgerEntry (refType `gift`); fraud checks (velocity, same device, circular gifts) in `fraudService`.
- **Revenue**: Creator share from LedgerEntry / Wallet; platform commission (e.g. CreatorTier.liveCommission). Payouts and holds: CreatorWallet, PayoutRequest, fraud/policy holds.

---

## 5. Live discovery engine

- **Live list**: GET `/live/streams` (or similar) with filters (status, category, tags); **LiveStream** has `status`, `category`, `tags`, text index on title/category/tags.
- **Scheduled**: **ScheduledStream**; reminders (e.g. streamReminder worker); discovery can show “upcoming” from ScheduledStream.
- **Featured / algorithm**: Use existing discovery/ranking (e.g. viewer count, recency); optional scoring in meta or a separate discovery service.

---

## 6. Moderation + trust system

- **Stream moderation**: Moderator actions over WS (mute, disable reactions, block gifts); moderator list and permissions (e.g. StreamModerator if implemented).
- **Trust / safety**: Level-Trust, TrustScore, FraudEvent (e.g. gift fraud, chargebacks); CreatorReputation; moderation queues and reports.
- **Content policy**: LiveStream.contentCategory (safe | mature | explicit), removedAt/removalReason, DMCA.

---

## 7. Live commerce hooks

- **Products on stream**: `LiveStream.featuredProductIds`; PATCH `/live/stream/:streamId` to set; GET `/shop/creator/:creatorId/live-shopping` for player page.
- **Checkout**: POST `/payments/shop/buy-now` (single product); optional CheckoutModal on stream page so “Buy Now” doesn’t leave the live view (see `docs/live-commerce-engine.md`).
- **Orders**: Order, PaymentTransaction, SupportTicket for post-purchase issues.

---

## 8. Summary table

| Concept | Millo implementation |
|---------|----------------------|
| Live session | **LiveStream** (+ **ScheduledStream** for scheduled) |
| Chat message | **StreamComment** (text); gift/system via WS or meta.type |
| Gift catalog | **Gift** |
| Gift transaction | **LedgerEntry** (refType `gift`) + economy |
| Real-time transport | **WebSocket** (not Socket.IO) |
| Job queue | **BullMQ** (not RabbitMQ) |
| DB | **MongoDB** (no MySQL) |
| API server | **Fastify** (not Express) |

Use the existing schemas and APIs above; extend with optional fields (e.g. `Gift` rarity, `StreamComment.meta.type`) or meta where needed, without adding new databases or duplicate models.

---

## 9. Start / End Live (controller mapping)

Your **startLive** / **endLive** controllers map to Millo as follows.

### Start live

| Your controller | Millo API |
|-----------------|-----------|
| `POST` with `title`, `category` | **POST /live/start** (auth) |
| `creatorId` | From auth: `req.user` → session; API uses `user._id`. |
| `streamKey` | Generated in `@millo/live` (`streamLifecycle.startStream`) with crypto; returned in response. |
| `playbackUrl` | Set at start when **LIVE_PLAYBACK_URL_TEMPLATE** (or **CDN_LIVE_PLAYBACK_TEMPLATE**) is defined. Placeholders: `{streamKey}`, `{streamId}`. Example: `https://cdn.millo.com/live/{streamKey}.m3u8`. |
| Response `liveId`, `streamKey` | Response is the full **LiveStream** object: `_id` (liveId), `streamKey`, `playbackUrl` (if template set), `title`, `category`, `status`, `startedAt`, etc. |

**Example**

- Request: `POST /live/start` with body `{ "title": "My stream", "category": "gaming" }` and `Authorization: Bearer <token>`.
- Response: `{ "_id": "...", "streamKey": "millo_...", "playbackUrl": "https://cdn.millo.com/live/millo_xxx.m3u8", "title": "My stream", "category": "gaming", "status": "live", "startedAt": "..." }`.

### End live

| Your controller | Millo API |
|-----------------|-----------|
| `POST` with `liveId` | **POST /live/end/:streamId** (auth). Pass `streamId` in the path (your `liveId`). |
| Set `status: "ended"`, `endedAt` | Done inside `live.endStream(streamId)` in `@millo/live`. |
| Response `{ success: true }` | Response is the updated **LiveStream** object (status, endedAt, etc.). Frontend can treat any 2xx as success. |

**Example**

- Request: `POST /live/end/64f1a2b3c4d5e6f7a8b9c0d1` with `Authorization: Bearer <token>`.
- Response: full stream object with `status: "ended"`, `endedAt` set. WebSocket room receives `stream_ended`; Janus room is destroyed.

---

## 10. Real-time system (Socket.IO → Millo WebSocket)

Millo uses **native WebSocket** (`@fastify/websocket`), not Socket.IO. Connect to **GET /live/ws?streamId=&lt;streamId&gt;** (and optionally `Authorization: Bearer &lt;token&gt;` via query or subprotocol). All messages are JSON: send one object per frame; receive broadcasts as JSON objects.

### Transport

| Your stack | Millo |
|------------|--------|
| Socket.IO server | **WebSocket** at `/live/ws?streamId=<streamId>` |
| `io.on("connection")` | Each client opens one WS connection; `streamId` is in the URL. |
| `socket.join(liveId)` | Server joins the socket to room `stream:<streamId>` on connection (no client event needed). |

### Join live / viewer count

| Your event | Millo equivalent |
|------------|------------------|
| **Client:** `socket.emit("join_live", { liveId, userId })` | **(1)** Connect to **WebSocket** `/live/ws?streamId=<liveId>` (optionally with auth). You are then in the room for that stream. **(2)** To increment **viewer count**, call **POST /live/join** with body `{ streamId }` (and auth if logged in). Server uses **Redis** `live:viewers:<streamId>` (INCR on join, DECR on leave). |
| **Server:** `redis.incr(\`live:${liveId}:viewers\`)` | **viewerCountRedis.incr(streamId)** — key pattern `live:viewers:<streamId>`. |
| **Server:** `io.to(liveId).emit("viewer_update")` | Server broadcasts **`{ type: "viewer_count", count }`** to the stream room after join/leave (and optionally sends current count in REST response). |

So: **join** = open WS with `streamId` + call **POST /live/join** for count. **Leave** = call **POST /live/leave** with `streamId` and `viewerId` (from join response); optionally close WS.

### Send message (chat)

| Your event | Millo equivalent |
|------------|------------------|
| **Client:** `socket.emit("send_message", data)` | **Client sends over WS:** `{ type: "send_message", data: { message: "<text>", displayName?: "<name>" } }`. |
| **Server:** `io.to(data.liveId).emit("new_message", data)` | Server validates (moderation, mute), persists **StreamComment**, then **broadcasts** to room: `{ type: "chat", user: { id, displayName }, message, timestamp, displayName, text }`. |

Listen for **`type === "chat"`** (and optionally **`event_message`** for events) for incoming messages.

### Send gift

| Your event | Millo equivalent |
|------------|------------------|
| **Client:** `socket.emit("send_gift", data)` | **Client sends over WS:** `{ type: "send_gift", data: { gift_id: "<giftId>", coins: <number> } }`. Auth required (Bearer in connection). |
| **Server:** `io.to(data.liveId).emit("gift_event", data)` | Server validates (stream live, gifts not blocked, fraud checks), debits sender (economy), credits creator, writes **LedgerEntry** (refType `gift`), then **broadcasts** to room: `{ type: "gift_sent", data: { ... } }` (and optionally activity payload). |

Listen for **`type === "gift_sent"`** for gift animations in the room.

### Summary

- **Connect:** `new WebSocket(API_BASE + '/live/ws?streamId=' + streamId)` (and auth header via query/subprotocol if your server supports it).
- **Join + viewer count:** After connect, call **POST /live/join** with `{ streamId }`; response includes `viewerId`, `viewerCount`. On page leave, call **POST /live/leave** with `{ streamId, viewerId }`.
- **Chat:** Send `{ type: "send_message", data: { message } }`; receive `{ type: "chat", ... }`.
- **Gift:** Send `{ type: "send_gift", data: { gift_id, coins } }`; receive `{ type: "gift_sent", ... }`.
- **Viewer count:** Receive `{ type: "viewer_count", count }` when anyone joins/leaves (after REST join/leave).

---

## 11. Live discovery algorithm (ranking engine)

Your **calculateLiveScore** and **getTrendingLives** are implemented in Millo as follows.

### Ranking formula

| Your input | Millo source |
|------------|--------------|
| `live.metrics.watchTime` | **LiveStream.meta.watchTime** (optional). Can be set by a worker that aggregates from **LiveStreamMetrics** or by the ingest when the stream ends (recordingDuration or sum of viewer session lengths). |
| `live.metrics.giftRevenue` | **LiveStream.totalGiftCoins** (updated on each gift). |
| `live.metrics.chatCount` | **LiveStream.meta.chatCount** (optional). Can be updated on each **StreamComment** or by a periodic job that counts `StreamComment.find({ streamId }).countDocuments()`. |
| `live.viewers` | **LiveStream.viewerCount** (or real-time from **viewerCountRedis**; the trending endpoint merges Redis count into the response). |
| `live.creatorTrustScore` | **CreatorReputation** score (0–100) normalized to 0–1; default 0.5 when missing. |

Default weights: watchTime 0.4, giftRevenue 0.25, chatCount 0.15, viewers/1000 0.1, creatorTrust 0.1. Overridable via env: `LIVE_RANKING_WEIGHT_*`.

### API

- **GET /live/streams/trending** — returns `{ streams }` where each item is a live stream object with **score** and **viewerCount** (Redis-backed when available). Query: `limit` (default 50, max 100), optional `category`, `visibility`.

### Service

- **liveRanking.service.js**: **calculateLiveScore(live, creatorTrustNormalized)** and **getTrendingLives(opts)**. Finds `LiveStream` with `status: 'live'`, batches **getCreatorReputationScoreMap(creatorIds)**, scores each stream, sorts by score desc, returns top N.

To back **watchTime** and **chatCount** from real data: (1) On stream end or periodically, set `LiveStream.meta.watchTime` (e.g. from recordingDuration or sum of viewer session durations) and `LiveStream.meta.chatCount` from `StreamComment.countDocuments({ streamId })`. (2) Or add a small worker that updates these fields so trending reflects current engagement.

---

## 12. Moderation system (AI + keyword filter, creator moderators)

### Keyword filter

| Your code | Millo |
|-----------|--------|
| `bannedWords = ["spam", "hate", "scam"]` | **Redis SET** `chat:banned` + optional **ABUSE_BANNED_WORDS** env. Admin can add/remove via chat filter API. |
| `moderateMessage(msg)` → true if msg contains banned word | **moderationService.moderateMessage(msg)** — returns `Promise<boolean>`: true if message should be blocked. Uses **chatFilter.filterChat** (Redis-backed banned words, case-insensitive substring). |

Live chat already calls **chatFilter.filterChat** before persisting (POST /live/stream/:streamId/chat and WS send_message). For a direct “should I block?” check, use **moderationService.moderateMessage(msg)**.

### Creator moderators

| Your model | Millo |
|------------|--------|
| `ModeratorSchema({ creatorId, moderatorId })` | **StreamModerator** — `creatorId` (ref User), `moderatorId` (ref User). Unique compound (creatorId, moderatorId). A moderator can act on any stream owned by that creator. |

**APIs**

- **GET /live/stream/:streamId/moderators** — list moderators (stream owner or admin). Returns `{ moderators }`.
- **POST /live/stream/:streamId/moderators** — add moderator; body `{ moderatorId }` or `{ userId }`. Stream owner only. Cannot add self.
- **DELETE /live/stream/:streamId/moderators/:userId** — remove moderator. Stream owner only.

**WS mod actions** (mute chat, disable reactions, block gifts, etc.): allowed if user is stream **owner**, **admin/mod**, or **StreamModerator** for that stream’s creator. **streamModerator.isModeratorForStream(streamId, userId)** is used in the live WebSocket handler.

---

## 13. Gift system (core monetization)

Your **sendGift** controller (REST: deduct coins, create GiftTx, emit gift_event) maps to Millo’s **WebSocket-first** gift flow plus an optional **REST** endpoint. Receiver is always the **stream creator** (no arbitrary receiverId for live).

### Flow comparison

| Your step | Millo equivalent |
|-----------|------------------|
| `liveId`, `giftId`, `receiverId`, `senderId` | **WebSocket:** Client sends `{ type: "send_gift", data: { gift_id, coins } }` on `/live/ws?streamId=<liveId>`. Server uses auth for **senderId**; **receiverId** = `stream.userId` (creator). No client-sent receiver for live. |
| `Gift.findById(giftId)` / `gift.priceCoins` | Server validates **coins** ≥ gift cost via `@millo/economy` **getGiftCost(giftId)**. Client sends `coins`; server does not trust a client-only price. |
| `deductCoins(senderId, gift.priceCoins)` | **economy.debit(userId, actualCost, 'gift', giftId, meta)** — atomic coin deduction (LedgerEntry). |
| `diamonds = gift.priceCoins * 0.5` | Millo uses **creator share** (e.g. 80% of coins): **economy.credit(receiverId, creatorShare, 'gift', giftId, meta)**. No separate “diamonds” model; use meta or a different ledger type if you add diamonds. |
| `GiftTx.create({ liveId, senderId, receiverId, giftId, coins, diamonds })` | **LedgerEntry** with `refType: 'gift'` and **meta**: `{ streamId, senderId, receiverId, giftId, coins }`. Two entries: debit (sender), credit (receiver). No separate GiftTransaction collection. |
| `req.io.to(liveId).emit("gift_event", { senderId, giftId, animation })` | Server **broadcasts** to room: `{ type: "gift_sent", gift_id, giftId, coins, senderId, displayName }`. Client can resolve **animation** from **Gift** catalog (GET gift list or cache) using `giftId` → `animationUrl`. |

### Sending a gift in Millo

**Option A — WebSocket (recommended for live)**

- Client is on `/live/ws?streamId=<streamId>` and sends:
  - `{ type: "send_gift", data: { gift_id: "<giftId>", coins: <number> } }`
- Server: checks stream is live, gifts not blocked, fraud (velocity, same device, same IP, gift ring, chargebacks, shadow ban), then **debit** sender, **credit** creator (with optional payout hold / pending for free creators), increments **LiveStream.totalGiftCoins**, enqueues fraud-check job, then **broadcasts** `{ type: "gift_sent", gift_id, giftId, coins, senderId, displayName }`.
- Response: no direct response; client sees **gift_sent** on the same WS. On failure (e.g. INSUFFICIENT_BALANCE), message is dropped and no event is sent.

**Option B — REST (for server-side or non-WS clients)**

- **POST /content/gifts/send**  
  Body: `{ receiverId, giftId, coins, streamId?: string, timestamp?, fingerprint?, nonce? }`  
  Same rules: **receiverId** = stream creator for live; server debits sender, credits receiver, writes LedgerEntry, applies fraud/hold. Real-time **gift_sent** is not broadcast automatically from this route; caller can emit it or rely on a separate WS connection.

### Animation URL

Your `gift_event` includes `animation: gift.animationUrl`. In Millo the **Gift** model has **animationUrl**. The WS payload does not include it to keep frames small. Clients should:

- Load the gift catalog once (e.g. GET gifts list or use a cached map).
- On **gift_sent**, use `giftId` to look up `animationUrl` and play the animation.

### Summary

- **Deduct coins:** `economy.debit(senderId, coins, 'gift', giftId, meta)`.
- **Creator share:** `economy.credit(receiverId, creatorShare, 'gift', giftId, meta)` (e.g. 80%; platform keeps the rest). Optional “diamonds” can be stored in meta or a separate ledger type.
- **Record:** LedgerEntry (refType `gift`, meta with liveId/streamId, senderId, receiverId, giftId, coins).
- **Real-time:** Broadcast `{ type: "gift_sent", gift_id, giftId, coins, senderId, displayName }`; client maps `giftId` → Gift.animationUrl for the animation.

---

## 14. Scheduling system

Your **scheduleLive** controller maps to Millo as follows.

### Schedule live

| Your controller | Millo API |
|-----------------|-----------|
| `POST` with `title`, `scheduledAt` | **POST /live/schedule** (auth) |
| `creatorId` | From auth: `user._id` (API uses authenticated user). |
| `LiveSession.create({ creatorId, title, status: "scheduled", scheduledAt })` | **ScheduledStream** is created (not LiveStream). Field is **scheduledStart** (not `scheduledAt`). Status is **scheduled** by default. |
| Response `live` | Response is the **ScheduledStream** object: `_id`, `creatorId`, `title`, `scheduledStart`, `status: "scheduled"`, `streamType`, `description`, `thumbnailUrl`, etc. |

**Request body**

- **title** — optional; stored on ScheduledStream (max 200 chars).
- **scheduledStart** or **scheduled_start** — required; must be a future ISO date string. Validated and stored as `scheduledStart`.
- Optional: **description**, **thumbnailUrl** / **thumbnail**, **streamType** (`standard` | `auction` | `paid_event` | `product_launch`), **priceCents**, **productIds**, **auctionIds**, **notifyFollowers** (default true).

**Example**

- Request: `POST /live/schedule` with body `{ "title": "My stream", "scheduledStart": "2025-03-01T20:00:00.000Z" }` and `Authorization: Bearer <token>`.
- Response: full **ScheduledStream** document. A worker (`startScheduledStreams.worker`) creates a **LiveStream** and links it when `scheduledStart` is reached.

**List upcoming**

- **GET /live/scheduled/upcoming** — query params: `limit` (default 20), optional `creatorId`. Returns scheduled streams with `status: 'scheduled'` and `scheduledStart >= now`, sorted by `scheduledStart` ascending.

---

## 15. Trust + anti-fraud system

Your **calculateTrustScore(user)** formula maps to Millo’s existing trust and reputation models. Millo does not expose a single “trustScore” function with your exact weights; it uses **AccountTrustScore** (per-user, 0–100) and **CreatorReputation** (per-creator, 0–100) with configurable factors.

### Factor mapping

| Your input | Millo equivalent |
|------------|------------------|
| **user.accountAge** × 0.2 | **AccountTrustScore.factors.accountAge** (0–100). Level-Trust / trust engine can derive age from `User.createdAt`. Used in overall score and in **CreatorReputation** via **WEIGHT_ACCOUNT_TRUST** (default 0.2). |
| **user.verified** ? 0.3 : 0 | **User.emailVerified** (or KYC/verification flags). Often folded into account trust or behavior; CreatorReputation uses account trust as one factor. |
| **user.reportRate** × -0.3 | **AccountTrustScore.factors.reportScore** (lower = worse). **CreatorReputation**: **WEIGHT_REPORT_RATE** (default 0.1), report rate penalizes score. Negative weight = higher reports → lower score. |
| **user.paymentSuccessRate** × 0.5 | **AccountTrustScore.factors.paymentTrust** and **CreatorReputation** **WEIGHT_PAYMENT_HISTORY** (default 0.1). Chargebacks/refunds reduce score; successful history improves it. |

### Where scores live

- **AccountTrustScore** (MongoDB): `userId`, `score` (0–100), `riskLevel` (high | medium | low), `factors` (accountAge, deviceReputation, behaviorScore, paymentTrust, socialGraphScore, reportScore), `updatedAt`. Used for gating (e.g. DMs, payouts) via **@millo/level-trust**.
- **CreatorReputation** (CRS): per-creator score and band (trusted | good_standing | monetization_limited | high_risk | monetization_disabled). Used for live monetization, storefront, payouts, and **live discovery** (e.g. **getCreatorReputationScoreMap** in trending).

### Anti-fraud (beyond trust score)

- **fraudService**: velocity checks, same-device/same-IP checks, gift rings, chargeback flags, shadow ban, payout hold. **FraudEvent** records blocks/reviews.
- **Moderation**: shadow ban, strikes, report resolution. **Moderation** model; **ModerationLog** for actions.

### Using your formula in Millo

To mirror your weights (0.2, 0.3, -0.3, 0.5) exactly you would either:

1. **Customize** the Level-Trust / CreatorReputation weight env vars (e.g. `CRS_WEIGHT_ACCOUNT_TRUST`, `CRS_WEIGHT_REPORT_RATE`, `CRS_WEIGHT_PAYMENT_HISTORY`) and ensure account age, verified, report rate, and payment success are fed into the existing factors, or  
2. Add a **thin wrapper** that reads `AccountTrustScore` (and optionally `User.emailVerified`, report counts, payment stats), computes one score with your formula, and caches or exposes it for product use.

The existing pipelines already feed gates, discovery, and payouts; your formula maps onto those factors and weights.

---

## 16. What you now have (checklist)

This system includes:

| Capability | Millo implementation |
|------------|---------------------|
| **Live streaming engine** | LiveStream + ScheduledStream; POST /live/start, /live/end; streamKey, playbackUrl (HLS); Janus WebRTC (publish/subscribe). |
| **Real-time chat + reactions** | WebSocket /live/ws; StreamComment; send_message → chat; live_reaction → reaction_burst; viewer_count (Redis + join/leave). |
| **Gift economy (TikTok-style)** | Gift catalog; send_gift over WS → economy debit/credit, LedgerEntry, gift_sent broadcast; fraud checks (velocity, same device, ring). |
| **Multi-guest architecture** | Co-host request (WS) → cohost/invite, accept, reject, remove; Janus publish for creators + co-hosts; same room. |
| **Live commerce hooks** | featuredProductIds on LiveStream; product_drop WS; GET /shop/creator/:id/live-shopping; buy-now, checkout. |
| **Discovery algorithm** | liveRanking.service (watchTime, giftRevenue, chatCount, viewers, creatorTrust); GET /live/streams/trending. |
| **Moderation system** | Keyword filter (chatFilter + moderateMessage); StreamModerator (creator-appointed); stream moderation flags (mute, block gifts); shadow ban, strikes. |
| **Scheduling system** | ScheduledStream; POST /live/schedule (scheduledStart, title); GET /live/scheduled/upcoming; worker creates LiveStream at start time. |
| **Trust + anti-fraud layer** | AccountTrustScore, CreatorReputation (CRS); fraudService (velocity, device, chargebacks, payout hold); FraudEvent, Moderation. |

---

## 17. Reality check (what’s still needed to compete at scale)

This is TikTok-level **architecture** in one codebase; to actually compete you still need:

| Gap | Notes |
|-----|--------|
| **Massive scale infra** | CDN (HLS at edge), autoscaling (API + workers), multi-region Redis/DB, ingest scaling (RTMP/WebRTC edge). Millo gives the app logic; infra is deployment and ops. |
| **AI models** | Moderation (content/text) and ranking (discovery, recommendations). Millo has rule-based filters, CRS, and a ranking formula; ML-based moderation and personalized ranking are separate model pipelines. |
| **Behavioral analytics pipelines** | Watch time, gifts/min, chat/min, retention, funnel events. Millo has Kafka + BullMQ + raw data (LiveStreamMetrics, StreamComment, LedgerEntry, join/leave); aggregated pipelines (e.g. per-stream metrics into meta or analytics DB) and dashboards need to be built or extended. |

The doc and codebase cover the **product surface** and **data models**; scale, AI, and analytics are the next layer.

---

## 15. Trust + anti-fraud system

Your **calculateTrustScore(user)** formula maps to Millo’s **trust score** and **creator reputation** as follows.

### Your formula → Millo signals

| Your input | Millo equivalent |
|------------|------------------|
| `user.accountAge * 0.2` | **AccountTrustScore.factors.accountAge** (0–100 from `User.createdAt`, capped by `TRUST_ACCOUNT_AGE_MAX_DAYS`). Weight **0.2** in **trustScoreEngine.calculateFromFactors**. |
| `user.verified ? 0.3 : 0` | No single “verified” bonus. **emailVerified** can be used in behavior/eligibility (e.g. large gifts require verified email). Device and behavior factors (deviceReputation, behaviorScore) act as trust boost; verified identity is often reflected there or in CreatorReputation. |
| `user.reportRate * -0.3` | **AccountTrustScore.factors.reportScore** (0–100 penalty from reports where user is target). In **trustScoreEngine**: **- reportScore * 0.25**. Report count → penalty in **getReportPenaltyFactor**. |
| `user.paymentSuccessRate * 0.5` | **AccountTrustScore.factors.paymentTrust** (0–100). **trustScoreEngine.getPaymentTrustFactor**: completed payments boost score; chargebacks heavily reduce it. Weight **0.15** in base trust; **CreatorReputation** also uses refund rate, chargebacks, disputes (payment history). |

### Millo’s base trust score (user-level)

- **trustScoreEngine.calculateTrustScore(userId)** (and **getTrustScore(userId)**):
  - Gathers: **accountAge**, **deviceReputation**, **behaviorScore**, **paymentTrust**, **socialGraphScore**, **reportScore** (penalty).
  - Formula: `accountAge*0.2 + deviceReputation*0.2 + behaviorScore*0.25 + paymentTrust*0.15 + socialGraphScore*0.15 - reportScore*0.25` → 0–100.
  - Persisted in **AccountTrustScore** (userId, score, riskLevel, factors).

### Creator-level (CRS)

- **CreatorReputation** (CRS) uses **getTrustScore(creatorId)** as one input plus: content authenticity, audience authenticity, monetization behavior, refund rate, report rate, payment history (chargebacks), community reputation (strikes). Used for monetization eligibility, discovery multiplier, payouts.

### Anti-fraud usage

- **fraudService**: gift velocity, same-device/same-IP, gift rings, chargebacks, subscription fraud, auction fraud; **FraudEvent** records; shadow ban and payout holds.
- **Level-Trust / AccountTrustScore**: feed ranking, live discoverability, DM limits, etc.

So your **calculateTrustScore** is implemented as **trustScoreEngine.calculateTrustScore(userId)** with the factor mapping above; use **getTrustScore(userId)** for a cached 0–100 score and risk level.
