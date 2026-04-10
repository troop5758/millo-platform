# Phase 6 — Live Commerce

**Owns:** Shopfront, Auctions, Ticketing, Revenue split, Ledger integration.  
**Must NOT include:** Coin pack logic.  
**Depends on:** Phase 2, Phase 4.

---

## Shopfront

- **API:** `getShopfront(creatorId)`, `listItems(creatorId)`, `addItem(creatorId, itemId, type, meta)` (type: `auction` | `ticket`), `removeItem(creatorId, itemId)`.
- **Location:** `packages/economy/src/shopfront.js`. In-memory catalog; no coin pack logic.

## Coins (wallet only)

- **API:** `getBalance(userId)`, `credit(userId, amountCents, refType, refId, meta)`, `debit(userId, amountCents, refType, refId, meta)`.
- **Double-spend:** Debit uses `findOneAndUpdate` with condition `balanceCents >= amountCents`; if not matched throws `INSUFFICIENT_BALANCE`. Only one concurrent debit can succeed per wallet.
- **Location:** `packages/economy/src/coins.js`. No coin pack purchase API.

## Gifts

- **API:** `sendGift(senderId, receiverId, amountCents, refId, meta)` — debits sender, credits receiver; ledger + financial audit for both.
- **Location:** `packages/economy/src/gifts.js`.

## Auctions

- **API:** `createAuction(sellerId, itemId, reserveCents)`, `placeBid(auctionId, bidderId, amountCents)` (debits bidder), `settleAuction(auctionId, winningBidId)` (credits seller, refunds others).
- **Location:** `packages/economy/src/auctions.js`.

## Ticketing

- **API:** `purchaseTicket(buyerId, ticketId, amountCents, sellerId, meta)` — debit buyer, credit seller; ledger + audit.
- **Location:** `packages/economy/src/tickets.js`.

## Revenue split

- **API:** `recordRevenue(amountCents, splits, refType, refId, meta)` — `splits` = `[{ userId, percent }]`, must sum to 100; credits each party via coins + ledger.
- **Location:** `packages/economy/src/revenueSplits.js`.

## Ledger integration

- Every credit/debit appends to **LedgerEntry** (immutable), **FinancialAuditLog**, and **Transaction**.
- **getNextSequence()**, **appendEntry()**, **getLedgerBalance(userId)**, **verifyLedgerIntegrity()** in `packages/economy/src/ledger.js`.

## Validation

- **No coin pack logic:** Economy exposes no API for purchasing coin packs (e.g. no `purchaseCoins`, `buyCoins`).
- **Shopfront:** `getShopfront`, `listItems` (and `addItem`, `removeItem`) present.
- **Double-spend impossible:** Unit tests in `packages/economy/src/coins.test.js`.
- **Immutable ledger:** Ledger append-only; balance matches wallet.

Run: `npm run validate:phase6` from repo root (requires MongoDB and `npm install`).

---

*Phase 6 complete. No coin pack logic. Proceed to next phase in specified order.*
