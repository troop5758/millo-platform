# Anti-Fraud Controls for Monetization

When free users can receive gifts, the system must be protected from bot farms, money laundering, stolen cards, and gift self-sending. Millo implements eligibility gates (verified/trusted creators only for withdrawal) and the following anti-fraud controls.

## Best practice

- **Free users can receive gifts** (with daily cap and pending earnings).
- **Only verified creators can withdraw** (and trusted creators get instant payouts).
- This matches industry standards (TikTok, Twitch) and reduces fraud.

## Controls

### 1. Device fingerprinting

- **Purpose:** Detect multi-account farms (same device, many users).
- **Implementation:** `DeviceFingerprint` stores fingerprint + userId; `fraudService.checkMultiAccount(fingerprint)` returns `{ allowed, accountCount }`. When `accountCount >= threshold` (default 5), gift is blocked.
- **Recording:** Frontend sends fingerprint (e.g. visitorId, userAgent, screen, timezone); API calls `fraudService.recordDevice(userId, fingerprint, opts)` after auth.
- **Same-device gift:** `checkSameDeviceGift(senderId, receiverId, senderFingerprint)` blocks if sender’s device is linked to receiver (self-gift or same-machine exploit).

### 2. Gift velocity limits

- **Max gifts per minute:** Configurable via platform setting `max_gifts_per_minute` (default **10**). Recommended: 10 to limit burst sending.
- **Max gift value per hour:** Configurable via `max_gift_value_per_hour_cents` (default **10000** = $100). Per-sender sum of gift debits in the last hour; if adding this gift would exceed the cap, gift is blocked.
- **High-risk users:** When gift risk score > 50, stricter limit (5 gifts/min) applies.
- **Implementation:** `fraudService.checkGiftVelocity(userId, { riskScore })`, `fraudService.checkGiftValuePerHour(userId, additionalCents)`. Both are enforced in the live gift flow before credit.

### 3. Risk scoring (signals)

Signals used in `evaluatePayment` and `evaluateGiftRisk` include:

- **IP mismatch** — Current IP not seen on user’s devices.
- **New account** — High amount or velocity from a new account.
- **Same device, multiple users** — Device fingerprint linked to many accounts.
- **Payment method reuse** — (Stripe Radar / external tools.)
- **Device reputation** — Low device reputation score.
- **Geo mismatch** — Account vs IP vs card country triple mismatch.
- **Chargebacks** — Recent chargebacks increase risk; may block or restrict gifts.

Risk score drives **delayed payouts** (payout hold tier: immediate vs 24h vs manual review) and stricter velocity for gifts.

### 4. Delayed payouts (7-day gift hold)

- **Gift → pending balance (7 days)** for **verified, non-trusted** creators.
- When a verified (but not trusted) creator receives a gift, a `PayoutHold` is created for that amount with `holdUntil = now + 7 days`. That portion of balance is not withdrawable until the hold expires.
- **Trusted** creators do not get this hold (instant payouts).
- **Purpose:** Reduces chargeback fraud: if the sender’s payment is reversed, the platform can claw back before the creator has withdrawn.

### 5. Other gift fraud checks (already in place)

- **Self-gift:** Blocked (sender === receiver).
- **Circular gifts:** `checkCircularGifts(senderId, receiverId)` — receiver sending many gifts back to sender in 24h = fraud ring; blocked.
- **Same-IP gift:** Sender IP matching receiver’s recent login IP can be blocked.
- **Gift ring detection:** Clusters of users exchanging gifts; flagged for review and/or block.
- **IP reputation:** Block when IP risk score exceeds threshold.

## Configuration (platform settings)

| Key | Default | Description |
|-----|---------|-------------|
| `max_gifts_per_minute` | 10 | Max gift transactions per sender per minute. |
| `max_gift_value_per_hour_cents` | 10000 | Max total gift value ($100) per sender per hour. |

Set in Admin → System Configuration or `PlatformSetting` collection.

## Summary

- **Device fingerprinting** → detect multi-account farms.
- **Gift velocity** → max 10 gifts/min, $100/hour per sender (configurable).
- **Risk scoring** → IP mismatch, new account, same device multiple users, payment reuse, etc.; used for payout hold tier and stricter gift limits.
- **7-day hold** on gift earnings for verified (non-trusted) creators → stops chargeback fraud.
- **Free users** can receive gifts but **cannot withdraw** until they become verified/trusted; this keeps the system safe while encouraging participation.
