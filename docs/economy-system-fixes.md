# Economy System Fixes

## 1. Redis ledger lock

- **Key**: `lock:ledger:{userId}` — prevents double spending on debit.
- **Implementation**: `packages/economy/src/coins.js` uses `redisLock.withLock(key, doDebit, ttl)` with key `lock:ledger:${userId}` and TTL 5000 ms (5 seconds). `packages/economy/src/utils/redisLock.js` uses Redis `SET key '1' NX PX ttlMs`.
- **Flow**: Every `debit(userId, ...)` acquires the lock, runs the debit, then releases. If lock is not acquired, throws `LOCK_NOT_ACQUIRED` (caller may retry or fail).

## 2. Gift type system

- **Schema**: `packages/database/src/schemas/Gift.js` — extended with:
  - `name` (String)
  - `type`: `'2d' | '3d' | 'ai'`
  - `priceCoins` (Number, optional; use `priceCoins ?? cost` for display/charge)
  - `animationUrl` (String, optional)
  - `soundUrl` (String, optional)
  - Existing: `cost`, `label`, `icon`, `active`, `id`
- **Usage**: When resolving gift price, use `gift.priceCoins ?? gift.cost`. Types 2D, 3D, AI are already in the enum.

## 3. Seller verification flow

- **Collection**: `seller_verifications` (model `SellerVerification`).
- **Stages**: `email` → `phone` → `kyc` → `bank_verification` → `manual_review`.
- **Schema**: `packages/database/src/schemas/SellerVerification.js` — added:
  - `stage`: enum `['email', 'phone', 'kyc', 'bank_verification', 'manual_review']`, default `'email'`
  - `completedStages`: array of completed stage strings
- **Static**: `SellerVerification.STAGE_ENUM` for programmatic use. Existing fields (businessName, taxId, idDocumentUrl, selfieUrl, address, bankAccount, status, reviewedBy, reviewedAt, rejectReason) unchanged.

## 4. Auction payment deadline worker

- **Worker**: `packages/api/src/workers/auctionDeadlineWorker.js` — processes expired auction payments, reassigns or marks defaulted, and applies penalty.
- **Flow**:
  1. Find auctions with `status: 'awaiting_payment'` and `deadline < now`.
  2. For each, skip if payment completed (`paidAt` or `meta.paidAt`).
  3. Call `reassignWinner(auction)`; if reassigned, move to next auction.
  4. If not reassigned (no second bidder): set `status: 'defaulted'`, write `FinancialAuditLog`, then **apply penalty**: create `Penalty` with `type: 'commerce_violation'`, `userId: winnerId`, `reason: 'auction_payment_defaulted'`, `refType: 'auction'`, `refId: auctionId`.
- **Startup**: Worker is started from `packages/api/src/index.js` (interval 1h).
