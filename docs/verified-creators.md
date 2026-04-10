# Verified Creators (Monetization Unlocked)

Verified creators have **monetization fully unlocked**: unlimited gifts, withdraw earnings, leaderboards, and live monetization. This tier sits above the paid creator upgrade: a user can be a paid creator (monthly/lifetime) but still need to meet verification requirements to withdraw.

## Requirements

| Requirement | Default | Description |
|-------------|---------|-------------|
| **Account age** | 30+ days | Based on `User.createdAt`. Configurable: `verified_creator_min_account_age_days` (PlatformSetting). |
| **Followers** | 500+ | Count of `Follow` where `followingId` = user. Configurable: `verified_creator_min_followers` (PlatformSetting). |
| **Phone verified** | Yes | `User.phoneVerified === true`. |
| **ID verification (KYC)** | Approved | KYC status approved and tax form submitted (`kycService.isKycApproved(userId)`). |
| **2FA enabled** | Yes | `User.flags.totpEnabled === true`. |
| **No violations** | Yes | No disqualifying strikes: `UserStrike.strikeCount === 0` and `status === 'active'`. |

All six checks must pass for a user to be considered a **verified creator**.

## Capabilities (when verified)

- **Unlimited gifts** — No daily cap; all gift earnings credited to withdrawable balance.
- **Withdraw earnings** — Payout requests and automated payouts allowed (in addition to KYC). Gift-sourced earnings are subject to a **7-day hold** (chargeback protection) until the creator becomes **trusted**.
- **Leaderboards** — Eligible to appear on creator leaderboards (`canJoinLeaderboards(userId)`).
- **Live monetization** — Full live monetization unlocked (`hasLiveMonetizationUnlocked(userId)`).

For **instant payouts** (no 7-day hold), brand sponsorship, live auctions, and premium meetings, creators must meet **trusted** requirements. See [Trusted Creators](trusted-creators.md).

## Integration

### Gift receiver eligibility

- **Tiers:** `free` | `paid` | `verified`.
- **Payout allowed:** Only when tier is `verified`. Paid-but-not-verified creators receive unlimited gifts but earnings remain **pending** until they meet verification requirements.
- **Pending earnings:** `tier !== 'verified'` (both free and paid-but-not-verified).

See [Gift Receiver Eligibility](gift-receiver-eligibility.md).

### Payout orchestration

- **Request payout:** `requestCreatorPayout` requires KYC **and** verified creator (`canWithdrawEarnings(creatorId)`). If not verified, returns `VERIFIED_CREATOR_REQUIRED`.
- **Execute payout (admin / batch):** Same check before execution; payouts are rejected if creator no longer meets verified requirements.
- **Automated payout cycle:** Only creators who are both KYC-approved and verified are processed; others are rejected with reason `VERIFIED_CREATOR_REQUIRED`.
- **Eligible for automated payout:** `getEligibleForAutomatedPayout()` only includes creators who are KYC-approved and verified.

### Leaderboards / live monetization

Use `verifiedCreatorService.canJoinLeaderboards(userId)` and `verifiedCreatorService.hasLiveMonetizationUnlocked(userId)` to gate features when product requires verified status.

## API

### Get my verification status (auth)

```http
GET /creators/verification-status
Authorization: Bearer <token>
```

Response:

- `verified`: boolean — all requirements met.
- `checks`: object — per-requirement status:
  - `accountAge`: `{ met, value, required, label }`
  - `followers`: `{ met, value, required, label }`
  - `phoneVerified`: `{ met, label }`
  - `kyc`: `{ met, label }`
  - `twoFa`: `{ met, label }`
  - `noViolations`: `{ met, label }`
- `capabilities`: when `verified === true`: `{ unlimitedGifts, withdrawEarnings, leaderboards, liveMonetization }`, else `null`.
- `message`: optional (e.g. `USER_NOT_FOUND`).

### Get my upgrade + eligibility (auth)

```http
GET /creators/upgrade/me
Authorization: Bearer <token>
```

Response now includes:

- `giftEligibility.tier`: `'free'` | `'paid'` | `'verified'`.
- `verificationStatus`: same shape as `GET /creators/verification-status`.

## Service

- **`packages/api/src/services/verifiedCreatorService.js`**
  - `getVerificationStatus(userId)` — full status and checks.
  - `isVerifiedCreator(userId)` — boolean.
  - `canWithdrawEarnings(userId)` — used by payout and gift eligibility.
  - `canJoinLeaderboards(userId)` — gate leaderboards.
  - `hasLiveMonetizationUnlocked(userId)` — gate live monetization.
  - `getThresholds()` — configurable min account age and min followers (PlatformSetting).

## Summary

| | Free | Paid (not verified) | Verified | Trusted |
|---|-----|---------------------|----------|---------|
| Receive gifts | Yes (daily cap) | Yes (no cap) | Yes (no cap) | Yes (no cap) |
| Payout allowed | No | No | Yes (7-day hold on gifts) | Yes (instant) |
| Pending earnings | Yes | Yes | No | No |
| Leaderboards / live monetization | No | No | Yes (when gated) | Yes |

Verified status is computed on demand from account age, followers, phone, KYC, 2FA, and strikes; there is no separate “verified” badge stored on the user record unless the product adds one for display. Trusted creators see [Trusted Creators](trusted-creators.md).
