# Millo Creator Upgrade (Hybrid Model)

Upgrade from Free User to Creator via **$4.99/month** or **$69 one-time lifetime** unlock.

## Free User (Default)

Free accounts can participate with limited capabilities.

### Allowed
- Watch short videos
- Like / comment
- Follow creators
- Join livestreams
- Send gifts
- Receive gifts
- Buy products or auctions

### Restrictions
- Cannot host livestreams
- Cannot monetize content
- Cannot create storefronts
- Cannot run auctions
- Cannot schedule paid meetings
- Cannot upload monetized shorts

---

## Creator Upgrade Options

### Option 1 — Monthly Creator Plan
**$4.99 / month**

Unlocks:
- Host livestreams
- Receive gifts (monetization)
- Upload monetized shorts
- Create storefront
- Run auctions
- Schedule paid meetings
- Creator analytics
- Creator badges
- Priority discovery ranking

**Benefits:** Predictable recurring revenue for the platform.

### Option 2 — Lifetime Creator Unlock
**$69 one-time** (or **$49** launch price for first 10,000 creators)

Unlocks all creator features permanently.

**Benefits:** One-time purchase; no ongoing commitment. Good for casual creators and early adopters.

---

## Optional Launch Discount

- **Lifetime Creator Unlock**: $69 → **$49** for the first 10,000 creators.
- Configured via **PlatformSettings** (Admin or API):
  - `creator_lifetime_launch_cents` = 4900
  - `creator_lifetime_launch_cap` = 10000
- Default pricing can be overridden with:
  - `creator_monthly_cents` = 499
  - `creator_lifetime_cents` = 6900

---

## API

### Get upgrade options (public)
```http
GET /creators/upgrade-options
```
Response includes `free`, `monthly`, and `lifetime` plans with prices, features, and CTAs.

### Get my upgrade status (auth)
```http
GET /creators/upgrade/me
Authorization: Bearer <token>
```
Returns `creatorStatus`, `role`, and `upgrade` (current access record if any).

### Create checkout (auth)
```http
POST /creators/upgrade
Authorization: Bearer <token>
Content-Type: application/json

{ "type": "monthly" }
```
or
```json
{ "type": "lifetime" }
```
Returns `checkoutUrl` (Stripe Checkout) and `sessionId`. Redirect user to `checkoutUrl`.

### Success redirect
After payment, redirect user to:
```
{FRONTEND_URL}/creator/upgrade/success?session_id={CHECKOUT_SESSION_ID}
```

---

## Stripe Webhooks

- **checkout.session.completed** — `metadata.type` = `creator_monthly` or `creator_lifetime`: grant creator access, set `User.creatorStatus` = `approved`, `role` = `creator`, create/update `PlatformCreatorAccess`.
- **customer.subscription.updated** — `metadata.type` = `creator_monthly`: update `PlatformCreatorAccess.expiresAt` from `current_period_end`.
- **customer.subscription.deleted** — `metadata.type` = `creator_monthly`: set `PlatformCreatorAccess.status` = `expired`, then recompute user `creatorStatus`/`role`.

---

## Data Model

**PlatformCreatorAccess**
- `userId`, `type` (monthly | lifetime), `status` (active | canceled | expired)
- `amountCents`, `currency`
- `stripeSubscriptionId` (monthly), `stripePaymentIntentId` (lifetime), `stripeSessionId`, `stripeCustomerId`
- `expiresAt` (monthly only), `canceledAt`

---

## Recommended Upgrade Page

| Plan            | Price     | Best For                |
|-----------------|-----------|-------------------------|
| Free User       | $0        | Watching and interacting |
| Creator Monthly | $4.99/mo  | Active creators         |
| Creator Lifetime| $69 once  | Long-term creators      |

**CTA buttons:**
- **Start Creator Monthly**
- **Unlock Lifetime Creator**

Optional banner: *Lifetime Creator Unlock $69 → $49 (first 10,000 creators).*

---

## Economics Example

| Plan                 | Example        | Revenue example   |
|----------------------|----------------|-------------------|
| 10,000 monthly creators | $4.99/mo each | $49,900 / month  |
| 5,000 lifetime unlocks  | $69 once each | $345,000 one-time |

This hybrid captures:
1. **Curious users** — stay free  
2. **Active creators** — pay $4.99/month  
3. **Committed creators** — buy $69 lifetime  
