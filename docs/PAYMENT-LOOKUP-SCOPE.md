# Payment lookup scope (accepted risk / operator truth)

## What exists today

- **`MoneyIndex`** — single collection written on **PaymentReference** upserts, **PaymentTransaction** creates, **PayoutRequest** create/update (incl. Wise external id). Each row has a stable **`refId`** (UUID) plus **`provider` + `providerId`** (unique). Lookup: `GET /money/:id` or `GET /api/money/:id` (MoneyIndex only), or **`GET /payments/universal/:id`** / **`GET /payments/search`** which try **MoneyIndex first**, then the legacy multi-table chain.
- `GET /payments/search?reference=` — resolves **MoneyIndex** first, then **PaymentReference**, **LedgerEntry**, **Order**, **PayoutRequest**, **Chargeback**, **PaymentTransaction** (`_id`), **Dispute**, **PpvPurchase**, **IdempotencyRecord**. Returns `source` and normalized `payment` block. **Auth:** non-staff sees only own rows; **admin** and **support** may see any user’s hit and receive `operatorContext.paymentProviders`.
- `GET /payments/reference/:ref` — **`PaymentReference` only** (legacy shape). Staff responses may include `operatorContext.paymentProviders`.
- `GET /payments/universal/:id` — same resolution chain as search; response includes `source`, `provider`, `providerId`, `status`, `userId`, amounts where known. Staff may include `operatorContext.paymentProviders`.

Coverage still depends on data being present in those collections. This is **best-effort multi-table lookup**, not a guarantee that every historical processor id exists or that every money path is indexed.

The **`internal`** provider is used for **dev stub** shop orders (`referenceId` form `order:<mongoOrderId>`) so operators can correlate pending internal checkout stubs with `PaymentReference` lookup. **Stripe** checkout sessions are upserted as **`pending`** when the session is created and updated when webhooks fire.

## Operator rule

Treat lookup as **best-effort** until you run a deliberate project to:

1. Write `PaymentReference` on every new money path, and  
2. Backfill historical IDs where needed, and  
3. Optionally widen unified search further to **standalone `PaymentIntent` mirrors**, **TaxRecord** / **Auction** settlement ids, or a **warehouse / search index**, with product sign-off. (**`Dispute`**, **`PpvPurchase`**, **`IdempotencyRecord`** are included after the original six.)

## Universal cross-processor lookup

A **single indexed view** across **all** money tables and processor-native IDs is **not** implemented. `GET /payments/universal/:id` and `GET /payments/search` query **nine** collections in order: PaymentReference → LedgerEntry → Order → PayoutRequest → Chargeback → PaymentTransaction → Dispute → PpvPurchase → IdempotencyRecord. A full data-warehouse or search index remains a **larger** effort — see `docs/PLATFORM-GAPS.md`.

## Post-deploy (MongoDB)

After schema/index changes — including **`MoneyIndex`**, **`LedgerEntry`** (`refId`, `meta.paymentIntentId`), **`PpvPurchase`** (`meta.paymentIntentId`, `meta.stripeSessionId`, `meta.referenceId`, sparse) — run index sync once per environment:

```text
npm run db:sync-indexes
```

(`MONGODB_URI` must be set; script: `scripts/sync-indexes.js`.) Alternatively:

```text
node -e "require('@millo/database').connect(process.env.MONGODB_URI).then(() => require('@millo/database').syncIndexes()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })"
```

## Automated checks

- `packages/api/src/__tests__/ledger.service.test.js` — resolution order and DTO mapping (Vitest).

https://milloapp.com
