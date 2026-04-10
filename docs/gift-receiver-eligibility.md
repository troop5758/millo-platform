# Gift Receiver Eligibility (Free vs Paid vs Verified Creator)

Major platforms restrict who can receive money to reduce scams, bots, and fake accounts. Millo uses **free**, **paid**, and **verified** creator tiers. Only **verified** creators can withdraw; paid-but-not-verified creators receive unlimited gifts but earnings stay pending until they meet verification requirements.

## Rules

### Free creator (no paid upgrade)

- **Can receive gifts:** YES  
- **Max daily gift value:** $50 (5000 cents) — configurable via Admin → System Configuration → Platform: `free_creator_max_daily_gift_cents`  
- **Payout allowed:** NO  
- **Balance:** **Pending earnings** (Wallet only; CreatorWallet not credited)  
- **Requires:** Paid upgrade + verified creator status to withdraw  

**Purpose:** Lets new creators test the platform and earn, while limiting fraud and abuse.

### Paid creator (monthly or lifetime upgrade, not verified)

- **Can receive gifts:** YES  
- **Max daily gift value:** No cap  
- **Payout allowed:** NO (until verified)  
- **Balance:** **Pending earnings** until verified (Wallet credited; CreatorWallet not credited until user becomes verified)  

**Purpose:** Paid creators can receive unlimited gifts immediately; withdrawal is gated on verified creator requirements (account age, followers, phone, KYC, 2FA, no violations). See [Verified Creators](verified-creators.md).

### Verified creator (all verification requirements met, not trusted)

- **Can receive gifts:** YES  
- **Max daily gift value:** No cap  
- **Payout allowed:** YES (subject to KYC and platform hold)  
- **Balance:** Credited to Wallet and CreatorWallet; **gift earnings held 7 days** (chargeback protection) before withdrawable.

### Trusted creator (full monetization)

- **Can receive gifts:** YES  
- **Max daily gift value:** No cap  
- **Payout allowed:** YES  
- **Balance:** Credited to Wallet and CreatorWallet; **instant payouts** (no 7-day gift hold). Eligible for brand sponsorship, live auctions, premium meetings. See [Trusted Creators](trusted-creators.md).

## How it works

1. **Receiver tier**  
   - **Trusted** = verified + 5k+ followers, good reputation (CRS ≥ 70), KYC, payment account verified; instant payouts.  
   - **Verified** = user meets all verified creator requirements but not trusted; 7-day hold on gift earnings.  
   - **Paid** = user has active **PlatformCreatorAccess** but is not verified.  
   - **Free** = no active paid upgrade.

2. **When a gift is sent (live stream)**  
   - Sender is debited; receiver is credited.  
   - If receiver is **free**:  
     - Sum of gift credits to that receiver **today (UTC)** is computed from `LedgerEntry` (type `credit`, refType `gift`, actorId = receiver).  
     - If `dailyReceived + thisGift > free_creator_max_daily_gift_cents`, the gift is **rejected** (not credited).  
     - If within cap, credit is applied with **pending earnings**: only Wallet is updated; CreatorWallet is **not** credited.  
   - If receiver is **paid** or **verified**: no daily cap.  
   - **Pending earnings:** If tier is **free** or **paid** (not verified), credit is applied with pending earnings (CreatorWallet not credited). If **verified**, credit goes to CreatorWallet (withdrawable).

3. **When receiver upgrades or becomes verified**  
   - **Upgrade (paid):** New gifts have no daily cap; earnings still pending until verified.  
   - **Verified:** New gifts are withdrawable; existing balance reconciliation/sync can be used for past pending earnings if desired.

## Configuration

| Setting | Key | Default | Description |
|--------|-----|---------|-------------|
| Free creator max daily gift (cents) | `free_creator_max_daily_gift_cents` | 5000 | Max gift value per day for free creators ($50). |

Set in **Admin → System Configuration → Platform** or in the database `PlatformSetting` collection.

## API

- **GET /creators/upgrade/me** (auth)  
  Response includes `giftEligibility`, `verificationStatus`, and `trustedStatus`:
  - `giftEligibility.tier`: `'free'` \| `'paid'` \| `'verified'` \| `'trusted'`
  - `giftEligibility.canReceiveGifts`: true
  - `giftEligibility.maxDailyGiftCents`: number \| null (only for free)
  - `giftEligibility.dailyReceivedCents`: number \| null (only for free)
  - `giftEligibility.payoutAllowed`: boolean (true for verified and trusted)
  - `giftEligibility.pendingEarnings`: boolean (true for free and paid only)
  - `giftEligibility.instantPayout`: boolean (true only for trusted)
  - `giftEligibility.giftHoldDays`: number \| null (7 for verified, null for others)
  - `verificationStatus`: see [Verified Creators](verified-creators.md#api)
  - `trustedStatus`: see [Trusted Creators](trusted-creators.md#api)

## Economy

- **coins.credit(userId, amountCents, refType, refId, meta)**  
  If `meta.pendingEarnings === true` (or `meta.skipCreatorWallet === true`), only the Wallet is credited; CreatorWallet is **not** updated, so those earnings are not withdrawable until the user becomes a paid creator and/or balance is synced.

## Summary

| | Free | Paid (not verified) | Verified | Trusted |
|---|-----|----------------------|----------|---------|
| Can receive gifts | Yes | Yes | Yes | Yes |
| Max daily gift value | $50 (configurable) | No cap | No cap | No cap |
| Payout allowed | No | No | Yes | Yes |
| Balance type | Pending | Pending | Withdrawable (7-day hold on gifts) | Withdrawable (instant) |

This keeps the entry bar low while protecting the platform; only verified/trusted creators can withdraw. See [Verified Creators](verified-creators.md) and [Trusted Creators](trusted-creators.md). Anti-fraud: [Anti-Fraud Monetization](anti-fraud-monetization.md).
