# Gift Fraud Detection

Millo blocks and scores gift-related fraud using three main rules: self-gift, rapid gift loops (circular trading), and payment reversal patterns.

## 1. Self-gift (same account → self)

**Rule:** A user cannot send gifts to themselves.

- **Check:** `giftSender === giftReceiver` (or `String(senderId) === String(receiverId)`).
- **Action:** Block the transaction and return a clear error.
- **Implementation:**
  - **HTTP** `POST /content/gifts/send`: Explicit check at the start; returns `403 SELF_GIFT_NOT_ALLOWED` with message *"You cannot send gifts to yourself."*
  - **WebSocket** (live stream `send_gift`): If `user._id === receiverId` (stream creator), the gift is dropped (no credit/debit).
  - **Service:** `fraudService.blockSelfGift(senderId, receiverId)` returns `true` when the gift is allowed (sender ≠ receiver). `checkCircularGifts` also returns `{ allowed: false }` when sender === receiver, so both HTTP and WS paths are protected.

## 2. Rapid gift loops (circular trading)

**Rule:** Detect back-and-forth gift trading between two accounts (fraud rings).

- **Signals:** Receiver has sent many gifts back to the sender within a time window (e.g. 24 hours).
- **Implementation:** `fraudService.checkCircularGifts(senderId, receiverId)`:
  - Counts ledger entries where `actorId === receiver`, `meta.receiverId === sender`, `refType === 'gift'`, `type === 'debit'` in the last `CIRCULAR_GIFT_WINDOW_MS` (default 24h).
  - If count ≥ `CIRCULAR_GIFT_THRESHOLD` (configurable), returns `{ allowed: false, count }`.
- **HTTP:** Returns `403 CIRCULAR_GIFT_FRAUD` with message *"Circular gift trading detected."*
- **WebSocket:** Gift is not processed when `!circular.allowed`.
- **Config:** `CIRCULAR_GIFT_THRESHOLD`, `CIRCULAR_GIFT_WINDOW_MS` (see fraud service / env).

Additional protection:
- **Gift velocity:** `checkGiftVelocity` limits gifts per minute (stricter for high-risk users) to prevent rapid loops from a single account.

## 3. Payment reversal patterns (chargebacks)

**Rule:** Users with recent chargebacks are blocked from sending gifts (or heavily risk-scored).

- **Data:** `Chargeback` collection (Stripe disputes); `userId` and `createdAt` are used.
- **Implementation:**
  - **Block:** `fraudService.hasRecentChargebacks(userId, windowDays)` — default 90 days. If the user has any chargeback in that window, gift send is blocked.
  - **HTTP** `POST /content/gifts/send`: If `hasRecentChargebacks(user._id)` is true, returns `403 GIFT_BLOCKED_CHARGEBACK` with message *"Gifts are not allowed due to payment reversal history."*
  - **WebSocket:** Same check; if true, the gift is dropped (no debit/credit).
  - **Risk score:** `evaluateGiftRisk` adds +40 to risk score when the user has chargebacks in the last 90 days, so other safeguards (e.g. CAPTCHA, velocity) still apply even if the explicit block were relaxed.

## Flow summary

| Check              | HTTP response / WS behavior                    |
|--------------------|------------------------------------------------|
| Self-gift          | 403 `SELF_GIFT_NOT_ALLOWED` / drop             |
| Recent chargebacks | 403 `GIFT_BLOCKED_CHARGEBACK` / drop          |
| Circular gifts     | 403 `CIRCULAR_GIFT_FRAUD` / drop               |
| Gift velocity      | 429 `GIFT_VELOCITY_EXCEEDED` / drop            |
| Other fraud/risk   | CAPTCHA, block, or review per risk engine     |

## Code references

- **Self-gift and circular:** `packages/api/src/services/fraudService.js` — `blockSelfGift`, `checkCircularGifts`.
- **Chargebacks:** `fraudService.hasRecentChargebacks`, `evaluateGiftRisk` (chargeback count in 90 days); `packages/database/src/schemas/Chargeback.js`.
- **HTTP gift route:** `packages/api/src/routes/content.js` — `POST /content/gifts/send` (self-gift, chargeback, circular, velocity, CAPTCHA).
- **WebSocket gift:** `packages/api/src/routes/live.js` — `send_gift` handler (self-gift, chargeback, circular, velocity).

## Configuration

- **Chargeback window:** `hasRecentChargebacks(userId, 90)` — 90 days default; can be overridden or moved to env.
- **Circular gifts:** `CIRCULAR_GIFT_THRESHOLD`, `CIRCULAR_GIFT_WINDOW_MS` in fraud service.
- **Velocity:** `GIFT_VELOCITY_LIMIT`, `GIFT_VELOCITY_LIMIT_HIGH_RISK`, `GIFT_VELOCITY_WINDOW_MS` in fraud service.
