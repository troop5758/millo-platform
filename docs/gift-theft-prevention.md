# Gift Theft Prevention

Protections against gift theft on the Millo platform (live streaming + gifts + coins).

## Rule: Never Trust Client Gift Data

Attackers can attempt to:
- Replay gift requests
- Manipulate WebSocket messages
- Race-condition the wallet balance (double-spend)
- Forge sender IDs
- Intercept client-side events

**The server must never use client-provided sender identity or balance.** Use only authenticated session/socket data.

## Implemented Protections

### 1. Authenticated Socket Middleware

WebSocket routes use `authSocket.resolveAuth()` / `authSocket.requireAuth()` to attach the authenticated user to the socket:

- **Token source**: URL query param `?token=...` (Fastify WebSocket; no `handshake.auth` like Socket.IO)
- **Verification**: `resolveSession(token)` — session lookup in DB, not raw JWT
- **Attachment**: `socket.user = user` — handlers use `socket.user`, never client-provided identity

See `packages/api/src/sockets/authSocket.js`.

### 2. Sender Identity

| Flow | Sender Source | Never From Client |
|------|---------------|-------------------|
| HTTP `POST /content/gifts/send` | `authUser(request)` | ✓ |
| WebSocket `send_gift` | `socket.user` (from `resolveAuth`) | ✓ |

### 3. Receiver Identity

| Flow | Receiver Source |
|------|-----------------|
| HTTP | `receiverId` from body (validated via `validateId`) |
| WebSocket | `stream.userId` (stream creator) — never from client |

### 4. Wallet Validation Before Gift

**Never accept a gift if the sender lacks coins.** Millo enforces this via **atomic debit**, not a separate pre-check.

❌ **Vulnerable (TOCTOU race):**
```js
// Two concurrent requests can both pass this check, then both debit — double-spend
const wallet = await Wallet.findOne({ userId: senderId });
if (wallet.balance < coinCost) throw new Error('Insufficient balance');
await Wallet.updateOne({ userId: senderId }, { $inc: { balance: -coinCost } });
```

✅ **Correct (atomic check-and-debit):**
```js
// Single atomic operation: debit only if balance >= amount
const w = await db.Wallet.findOneAndUpdate(
  { userId, balanceCents: { $gte: amountCents } },
  { $inc: { balanceCents: -amountCents } },
  { new: true }
);
if (!w) throw new Error('INSUFFICIENT_BALANCE');
```

Both gift flows use `economy.debit()`, which performs this atomic update. If balance is insufficient, no document is updated and `INSUFFICIENT_BALANCE` is thrown — no race window.

### 5. Redis Atomic Lock (Optional Defense-in-Depth)

Millo provides `@millo/economy` → `redisLock` for per-user serialization:

```js
// packages/economy/src/utils/redisLock.js
const { acquireLock, releaseLock, withLock } = require('@millo/economy');

// NX = set only if not exists, EX = expire in seconds
await redis.set(key, 'locked', 'NX', 'EX', 5);

// Convenience: run fn with lock, auto-release
await withLock(`economy:gift:${userId}`, async () => {
  await debit(userId, amountCents, 'gift', giftId, meta);
  await credit(receiverId, creatorShare, 'gift', giftId, meta);
});
```

**Primary protection** is atomic MongoDB debit (above). Redis lock adds optional serialization per user — useful if you want to reduce DB contention under high concurrency. If Redis is unavailable, `acquireLock` returns `null` and the lock is skipped; atomic debit still prevents double-spend.

### 6. Cost Validation

Gift cost is validated server-side via `getGiftCost(giftId)` — client-provided `coins` must be ≥ minimum for the gift type.

### 7. Creator Share (80/20)

- 80% credited to receiver (creator)
- 20% platform fee (implicit)

## Final Secure Gift Flow

Reference flow and Millo implementation:

| Step | Reference | Millo |
|------|-----------|-------|
| 1. User clicks gift | ✓ | ✓ |
| 2. Client sends request with token | ✓ | HTTP: `Authorization: Bearer <token>`; WS: `?token=` in URL |
| 3. Socket verifies JWT | ✓ | `resolveSession(token)` — session lookup in DB (not raw JWT) |
| 4. Redis lock on wallet | ✓ | Optional; atomic MongoDB debit is primary. `redisLock.withLock` available. |
| 5. Wallet balance checked | ✓ | Atomic: `findOneAndUpdate` with `balanceCents: { $gte }` |
| 6. Coins deducted | ✓ | `economy.debit()` |
| 7. Gift transaction stored | ✓ | LedgerEntry, FinancialAuditLog, Transaction (via debit/credit) |
| 8. Server emits gift animation | ✓ | `liveChat.broadcastToRoom(rid, { type: 'gift_sent', ... })` |
| 9. Receiver wallet credited | ✓ | `economy.credit()` — done before broadcast |

**Ordering:** Millo credits the receiver before emitting (debit → credit → broadcast) so the receiver has the coins when the animation is shown.

## Secure Gift Transaction Flow

Millo's complete flow (HTTP + WebSocket):

```
1. Authenticate sender (authUser / socket.user) — never from client
2. Resolve receiver (stream.userId or validated body)
3. Validate cost ≥ getGiftCost(giftId)
4. Atomic debit sender (economy.debit) — throws INSUFFICIENT_BALANCE if not enough
5. Credit receiver (economy.credit, 80% share)
6. On credit failure: refund sender, return 500
7. Ledger + FinancialAuditLog + Transaction (via debit/credit)
8. Broadcast gift_sent, notify receiver
```

**Pitfalls to avoid** (from naive lock + check-then-act patterns):

| Issue | Millo approach |
|-------|----------------|
| Lock acquired but never released | Use `withLock(key, fn)` — auto-releases in `finally` |
| Check balance then debit (TOCTOU) | Atomic `findOneAndUpdate` with `balanceCents: { $gte }` |
| No receiver credit | Explicit `credit(receiverId, creatorShare, ...)` |
| No rollback on credit failure | Refund sender via `credit(userId, cost, 'gift_refund', ...)` |
| No audit trail | Ledger, FinancialAuditLog, Transaction via economy |

### 8. Server Emits Gift Event Only After DB Confirmation

**Never broadcast the gift to the room before the DB transaction succeeds.** If debit or credit fails, no one should see the gift.

```
1. await debit(...)   — DB
2. await credit(...) — DB
3. On success only → liveChat.broadcastToRoom(rid, payload)
4. On failure → return (no broadcast); optionally socket.emit('gift_failed', ...)
```

Millo broadcasts `gift_sent` only after both `debit` and `credit` complete successfully. On `INSUFFICIENT_BALANCE` or other errors, the handler returns without broadcasting.

### 9. Gift Ownership Verification

**Prevent another user from claiming the gift.** Only the receiver gets credited. Sender and receiver are recorded for audit; there is no "claim" step — the receiver is determined at transaction time by the server.

| Field | Millo equivalent |
|-------|-------------------|
| sender_id | `actorId` on debit; `meta.senderId` on credit |
| receiver_id | `meta.receiverId` on debit; `actorId` on credit |
| gift_id | `refId` |
| stream_id | Context (stream.userId for WS receiver) |
| created_at | `createdAt` on LedgerEntry, Transaction, FinancialAuditLog |

**Only the receiver gets credited:**
```js
await credit(receiverId, creatorShare, 'gift', giftId, { giftId, senderId: String(user._id) });
```

The sender is debited; the receiver is credited. No third party can "claim" a gift — the receiver is fixed when the transaction is created (stream creator for WebSocket, validated body for HTTP).

### 10. Rate Limit Gift Sending

**Prevent spam and bot attacks.** Millo uses `@fastify/rate-limit` (not express-rate-limit):

```js
// packages/api/src/routes/content.js
const GIFT_RATE_LIMIT = {
  max: 30,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many gifts — please slow down' }),
};

app.post('/content/gifts/send', { config: { rateLimit: GIFT_RATE_LIMIT } }, ...);
```

- **HTTP** `POST /content/gifts/send`: 30 requests per minute per IP
- **WebSocket** `send_gift`: No built-in rate limit (relies on atomic debit + timestamp). Consider adding per-user throttling in the message handler if needed.

### 11. Anti-Replay Protection

**Reject stale or duplicate gift requests.** Timestamp + optional nonce:

```js
// Timestamp: reject if request older than 10s or >5s in future (clock skew)
if (data.timestamp != null) {
  const ts = Number(data.timestamp);
  if (Date.now() - ts > 10000 || ts > Date.now() + 5000) throw new Error('EXPIRED_GIFT_REQUEST');
}

// Nonce (optional): store in Redis, reject if duplicate
// redis.set(`gift_nonce:${userId}:${nonce}`, '1', 'NX', 'EX', 60) — if !result, reject
```

Millo uses **rate limiting** (30 gifts/min on HTTP) and **optional timestamp validation**. When the client sends `timestamp: Date.now()` in the payload, requests older than 10s or more than 5s in the future are rejected. If timestamp is omitted, the request is allowed (backward compatible). Nonce validation (Redis SET NX) provides stronger replay prevention for high-value flows.

### 12. Secure Gift Animation Events

**Animations must only come from server events, not client.** A malicious client could spoof animations without sending a gift.

❌ **BAD:** Client emits animation event
```js
socket.emit("gift_animation");  // Spoofable — no coins spent
```

✅ **GOOD:** Server broadcasts after DB confirmation
```js
liveChat.broadcastToRoom(rid, { type: 'gift_sent', gift_id, coins, senderId, displayName });
```

Millo broadcasts `gift_sent` only after both `debit` and `credit` succeed. Clients receive it via WebSocket and trigger the animation (`onGiftReceived`). The client never emits `gift_sent` or `gift_animation` — it only receives and displays.

### 13. Client UI Protection

**The client must display the gift only after server confirmation.** Never play the animation on user click alone — wait for the server event.

```js
// GOOD: Play animation only when server confirms
socket.on('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'gift_sent') playGiftAnimation(msg);
});
```

Millo's LiveChat listens for `gift_sent` from the WebSocket and calls `onGiftReceived(msg)` → `handleGiftReceived` → plays the animation. The sender may also see an optimistic animation after HTTP 200 (server confirmed) — both are post-confirmation. The canonical source of truth is the server broadcast; all viewers (including sender) receive `gift_sent` when the server broadcasts to the room.

### 14. Fraud Detection Layer — Gift Velocity Detection

**Track suspicious gift activity.** Gift farms send hundreds of gifts per minute. Detect abnormal velocity.

```js
// fraudService.checkGiftVelocity(userId)
const count = await db.LedgerEntry.countDocuments({
  actorId: userId,
  refType: 'gift',
  type: 'debit',
  createdAt: { $gte: new Date(Date.now() - 60000) },
});
if (count >= 20) return { allowed: false, count };
```

Millo implements `checkGiftVelocity` and `logGiftSent` in fraudService. Both HTTP and WebSocket gift flows call `checkGiftVelocity` before processing — if `count >= 20` in the last minute, the request is blocked (HTTP: 429 `GIFT_VELOCITY_EXCEEDED`; WS: silent return). After success, `logGiftSent` records the gift in FraudEvent for audit. Rate limit (30/min) is the hard cap; velocity (20/min) is the fraud threshold.

### 15. Signed Gift Payloads

**Prevent tampering** of the request body in transit. Client signs the payload; server verifies.

```js
// Client: sign payload with shared secret (e.g. derived from session)
const crypto = require('crypto');
const payload = { receiverId, giftId, coins, streamId, timestamp };
const signature = crypto
  .createHmac('sha256', SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');
// Send { ...payload, signature }

// Server: verify before processing
const expected = crypto.createHmac('sha256', SECRET).update(JSON.stringify(payload)).digest('hex');
if (signature !== expected) throw new Error('INVALID_SIGNATURE');
```

Millo does not currently use signed payloads. HTTPS provides transport encryption; the server already validates all critical fields server-side (sender from auth, cost from `getGiftCost`, receiver from stream or validated body). Signed payloads add optional defense-in-depth for environments where the request may pass through untrusted intermediaries. The secret must be derived from the session (e.g. `HMAC(sessionToken, 'gift')`) so only the authenticated client can produce valid signatures.

## Files

- `packages/api/src/sockets/authSocket.js` — Authenticated socket middleware (`resolveAuth`, `requireAuth`)
- `packages/api/src/routes/live.js` — WebSocket `send_gift` handler
- `packages/api/src/routes/content.js` — HTTP `POST /content/gifts/send`
- `packages/economy/src/coins.js` — `debit()`, `credit()` with atomic balance check
- `packages/economy/src/utils/redisLock.js` — `acquireLock`, `releaseLock`, `withLock` (ioredis, NX/EX)
- `packages/economy/src/ledger.js` — Audit trail for all financial mutations

### 16. Audit Log

**All gift events must be logged.** Millo logs every gift debit and credit via three systems:

| User's example | Millo equivalent |
|----------------|-------------------|
| sender | `actorId` (debit) / `meta.senderId` (credit) |
| gift | `refId` (giftId) |
| ip | `meta.ip` (request.ip) |

```js
// economy.debit/credit automatically create:
await ledger.appendEntry({ type, actorId, amountCents, refType, refId, meta });
await db.FinancialAuditLog.create({ action, walletId, amountCents, refType, refId, actorId, meta });
await db.Transaction.create({ walletId, type, amountCents, refId, meta });
```

For gifts, `meta` includes `giftId`, `receiverId` (debit), `senderId` (credit), and `ip` (request.ip). Both HTTP and WebSocket gift flows pass IP into meta for audit.

## Audit

All gift debits and credits are logged via:
- `ledger.appendEntry` — immutable ledger
- `FinancialAuditLog` — every financial mutation
- `Transaction` — wallet-level transaction history

## Result

This system prevents:

| Attack | Protection |
|--------|------------|
| **Gift replay attacks** | Timestamp validation, rate limiting, optional nonce |
| **Wallet race conditions** | Atomic MongoDB debit (`balanceCents: { $gte }`) |
| **User ID spoofing** | Sender from auth/socket only; receiver from stream or validated body |
| **Gift duplication** | Atomic debit; single source of truth for animation (server broadcast) |
| **Animation spoofing** | Server emits `gift_sent` only after DB confirmation; client never emits |

Your gift economy becomes tamper-resistant.

## Advanced Gift & Economy Anti-Fraud System

Fraud systems usually run in three layers:

| Layer | Focus | Millo |
|-------|-------|-------|
| **Layer 1 — Transaction security** | Atomic ops, auth, replay prevention, rate limits | ✓ Atomic debit, authSocket, timestamp, rate limit |
| **Layer 2 — Behavior detection** | Velocity, device fingerprint, anomaly signals | fraudService (payments, PPV); gift velocity optional |
| **Layer 3 — Payout risk control** | Creator verification, hold periods, chargeback handling | Phase 11; Stripe Radar, Sift, Riskified |

Combined they stop:

| Fraud type | Primary layer |
|------------|---------------|
| Bot gift farms | L1: rate limit, timestamp; L2: velocity, device fingerprint |
| Fake viewers | L2: behavior signals |
| Coin laundering | L1: atomic audit trail; L2: velocity, multi-account detection |
| Stolen payment cards | L1: auth; L2/L3: Stripe Radar, payment anomaly |
| Gift inflation | L1: cost validation; L2: velocity, FraudEvent |
| Payout fraud | L3: payout verification, hold periods |

### Transaction Fingerprinting

**Every gift transaction should record a device fingerprint** to detect multi-account bot farms.

Millo has `DeviceFingerprint` (Phase 11) and `fraudService.recordDevice()`:

```js
// packages/database/src/schemas/DeviceFingerprint.js
// Fields: fingerprint, userId, firstSeenAt, lastSeenAt, ip, userAgent, meta
```

| User's schema | Millo equivalent |
|---------------|------------------|
| user_id | userId |
| ip | ip |
| fingerprint_hash | fingerprint (client-provided hash) |
| device, browser, os, country | userAgent (parsed) or meta |

**Flow:** Frontend calls `POST /fraud/track` with `{ fingerprint }` after auth. The fingerprint is a client-generated hash (e.g. from canvas, WebGL, screen resolution). `fraudService.recordDevice()` stores it. `evaluatePayment()` checks for multi-account (same fingerprint → many users).

**Gift integration:** The client can send `fingerprint` in the gift payload. The server stores it in `meta.deviceFingerprint` on LedgerEntry/FinancialAuditLog and FraudEvent.

### Multi-Account Detection

**Fraudsters create many accounts on the same device.** Millo implements `fraudService.checkMultiAccount(fingerprint, threshold)`:

```js
// Same fingerprint → many users = device farm
const distinctUsers = await db.DeviceFingerprint.distinct('userId', { fingerprint });
if (distinctUsers.length >= 5) throw new Error('Device farm detected');
```

When the client sends `fingerprint` in the gift payload, the server calls `checkMultiAccount` before processing. If the fingerprint is linked to ≥5 accounts, the request is blocked (HTTP: 403 `DEVICE_FARM_DETECTED`; WS: silent return). Threshold is configurable (default 5). `evaluatePayment` also checks multi-account for payments (threshold 3).

### Gift Circular Trading Detection

**Fraud rings send gifts back and forth.** Millo implements `fraudService.checkCircularGifts(senderId, receiverId, threshold)`:

```js
// Count: receiver → sender gifts in last 24h
const count = await db.LedgerEntry.countDocuments({
  actorId: receiver,
  'meta.receiverId': sender,
  refType: 'gift',
  type: 'debit',
  createdAt: { $gte: new Date(Date.now() - 86400000) },
});
if (count >= 5) throw new Error('Circular gift fraud');
```

Both HTTP and WebSocket gift flows call `checkCircularGifts` before processing. If the receiver has sent ≥5 gifts to the sender in the last 24 hours, the request is blocked (HTTP: 403 `CIRCULAR_GIFT_FRAUD`; WS: silent return). Threshold and window are configurable.

### Payment Risk Score

**Every payment gets a fraud score.** Millo's `fraudService.evaluatePayment()` returns `{ riskScore, action, signals }`:

| Signal | Score | Description |
|--------|-------|-------------|
| multiple_accounts | +35 | Same fingerprint, many users |
| device_new | +15 | New device for this user |
| ip_mismatch | +20 | IP never seen on user's devices |
| device_count_high | +20 | User has >3 devices |
| ip_country_mismatch | +30 | ipCountry ≠ accountCountry (pass in opts) |
| card_country_mismatch | +40 | cardCountry ≠ accountCountry (pass in opts) |
| payment_velocity | +25 | Too many payments per hour |
| payment_anomaly_high_amount | +10–30 | High amount, new account |

**Action:** `allow` (score &lt; 50), `review` (50–79), `block` (≥80). Payment flows call `evaluateAndLogPayment` before creating PaymentIntent; block when `action === 'block'`. Pass `ipCountry`, `accountCountry`, `cardCountry` in opts when available (e.g. from geo IP, Stripe).

### Risk-Based Gift Limits

**If risk is high → limit gifts.** Millo implements `evaluateGiftRisk()` and passes the score to `checkGiftVelocity()`:

```js
if (riskScore > 50) maxGiftPerMinute = 5;  // else 20
```

- **evaluateGiftRisk(userId, opts)** — Returns `{ riskScore }` from device count, multi-account (if fingerprint), recent FraudEvent review/block.
- **checkGiftVelocity(userId, opts)** — Accepts `riskScore` in opts. If `riskScore > 50`, uses limit 5/min; else 20/min.

Both gift flows call `evaluateGiftRisk` before `checkGiftVelocity` and pass the score. High-risk users get a stricter limit (5/min vs 20/min).

### Bot Viewer Detection

**Bot viewers artificially boost live streams.** Millo implements `fraudService.detectViewerSpike(streamId, opts)`:

```js
// Count joins in last 10s
const count = await db.LiveViewer.countDocuments({
  streamId,
  joinedAt: { $gte: new Date(Date.now() - 10000) },
});
if (count > 200) console.warn('Bot spike detected');
```

Returns `{ spikeDetected, count }`. When `count > 200` (configurable), logs a warning and creates a FraudEvent (`eventType: 'viewer_spike'`) for audit. Call periodically (e.g. cron every 10s for active streams) or after join. Uses `LiveViewer.joinedAt`; default window 10s, threshold 200.

### AI Behavior Model

**Advanced systems train ML models** using: gift frequency, viewer retention, device reuse, payment history, chat behavior. Low scores = suspicious.

```js
// Simple heuristic (placeholder for ML)
function behaviorScore(user) {
  return (
    (user.gifts_sent ?? 0) * 0.4 +
    (user.watch_time ?? 0) * 0.3 +
    (user.account_age_days ?? 0) * 0.3
  );
}
```

Millo's rule-based signals (evaluatePayment, evaluateGiftRisk, checkCircularGifts, etc.) provide inputs for a future ML pipeline. Data sources: LedgerEntry (gifts), LiveViewer (watch time), DeviceFingerprint (device reuse), FraudEvent (payment history), chat/DM activity. A trained model could replace or augment threshold-based rules.

### Delayed Creator Payout

**High-risk earnings are held.** Millo implements `fraudService.applyPayoutHold()` and `getHeldAmount()`:

```js
await PayoutHold.create({
  creatorId: userId,
  amountCents: amount,
  holdUntil: new Date(Date.now() + 604800000), // 7 days
  reason: 'high_risk',
});
```

- **applyPayoutHold(creatorId, amountCents, opts)** — Creates PayoutHold. Default 7 days; pass `holdDaysMs` or `reason` in opts.
- **getHeldAmount(creatorId)** — Sum of active holds (holdUntil > now). Use when calculating withdrawable balance.

Call `applyPayoutHold` when fraud signals indicate high-risk (e.g. FraudEvent review/block, circular gifts). The payout flow should call `getHeldAmount` and reduce the creator's withdrawable balance by that amount before allowing a payout request.

https://milloapp.com
