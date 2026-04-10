# Trusted Creators (Full Monetization)

Trusted creators have **full monetization**: unlimited gifts, **instant payouts** (no 7-day hold), brand sponsorship, live auctions, and premium meetings. This tier sits above verified: a creator must be verified first, then meet additional requirements to become trusted.

## Requirements

| Requirement | Default | Description |
|-------------|---------|-------------|
| **Verified creator** | Yes | All verified creator requirements must be met first. |
| **Followers** | 5,000+ | Configurable: `trusted_creator_min_followers` (PlatformSetting). |
| **Good reputation** | CRS ≥ 70 | Creator Reputation Score (good_standing band). Configurable: `trusted_creator_min_reputation_score`. |
| **Completed KYC** | Yes | KYC approved and tax form submitted. |
| **Payment account verified** | Yes | At least one payout method configured: Stripe Connect, PayPal payout email, or Wise profile. |

All must pass for **trusted** status.

## Capabilities (when trusted)

- **Unlimited gifts** — No daily cap; all gift earnings credited to withdrawable balance.
- **Instant payouts** — No 7-day hold on gift earnings (chargeback protection hold applies only to verified, non-trusted).
- **Brand sponsorship** — Eligible for brand deals (gate features with `trustedCreatorService.isTrustedCreator(userId)`).
- **Live auctions** — Full live auction monetization (in addition to CRS storefront/auction eligibility).
- **Premium meetings** — Premium paid meetings (gate with trusted status when required).

## Comparison: Verified vs Trusted

| | Verified | Trusted |
|---|----------|---------|
| Withdraw | Yes | Yes |
| Gift earnings hold | 7 days (chargeback protection) | None (instant) |
| Followers (min) | 500+ | 5,000+ |
| Reputation | Not required for verified | CRS ≥ 70 |
| Payment account | Not required for verified | Required |

## Integration

### Gift receiver eligibility

- **Tiers:** `free` | `paid` | `verified` | `trusted`.
- **Instant payout:** Only `trusted`; `verified` has 7-day hold on gift earnings.
- **7-day hold:** When a **verified** (non-trusted) creator receives a gift, a `PayoutHold` is created for that amount with `holdUntil = now + 7 days`. Trusted creators do not get this hold.

See [Gift Receiver Eligibility](gift-receiver-eligibility.md).

### Payout orchestration

- Request and execute payout logic does not distinguish trusted vs verified for *eligibility* (both can withdraw). The difference is **when** earnings become withdrawable: trusted immediately, verified after the 7-day hold on gift-sourced funds.

## API

### Get my trusted status (auth)

```http
GET /creators/trusted-status
Authorization: Bearer <token>
```

Response:

- `trusted`: boolean — all requirements met.
- `checks`: object — verified, followers, reputation, kyc, paymentAccountVerified (each with `met`, and where applicable `value`, `required`, `label`).
- `capabilities`: when trusted — `{ unlimitedGifts, instantPayouts, brandSponsorship, liveAuctions, premiumMeetings }`; else `null`.

### Get my upgrade + eligibility (auth)

```http
GET /creators/upgrade/me
```

Response includes:

- `giftEligibility.tier`: `'free'` | `'paid'` | `'verified'` | `'trusted'`.
- `giftEligibility.instantPayout`: boolean (true only for trusted).
- `giftEligibility.giftHoldDays`: 7 for verified, null for others.
- `trustedStatus`: same shape as `GET /creators/trusted-status`.

## Service

- **`packages/api/src/services/trustedCreatorService.js`**
  - `getTrustedStatus(userId)` — full status and checks.
  - `isTrustedCreator(userId)` — boolean.
  - `instantPayoutEligible(userId)` — true for trusted (no 7-day gift hold).
  - `hasPaymentAccountVerified(userId)` — has Stripe Connect / PayPal / Wise.
  - `getMinFollowersTrusted()`, `getMinReputationTrusted()` — configurable thresholds.

## Optimal hybrid (summary)

| User type | Receive gifts | Withdraw |
|-----------|----------------|----------|
| Viewer | No | No |
| Free creator | Yes (daily cap, pending) | No |
| Verified creator | Yes | Yes (7-day hold on gift earnings) |
| Trusted creator | Yes | Yes (instant) |

This structure encourages participation, reduces fraud, and matches industry standards (e.g. TikTok, Twitch) where free users can receive gifts but only verified/trusted creators can withdraw.
