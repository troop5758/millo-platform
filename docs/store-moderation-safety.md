# Store Moderation & Safety

Admins can enforce store and seller safety for fraud prevention:

- **Suspend store** — Hide storefront and block new listings/sales.
- **Remove product** — Take down a product (admin-only status).
- **Freeze payouts** — Block a seller from withdrawing earnings.
- **Audit seller activity** — View store status, orders, products, payouts, and admin actions for a seller.

All admin actions are logged to **AdminAuditLog** (action, adminId, targetType, targetId, overrideReason, meta).

---

## Suspend store

When a store is suspended:

- **GET /shop/store/:slug**, **GET /shop/store/:slug/storefront-config**, and **GET /shop/creator/:creatorId/storefront-config** return **403** with `error: 'STORE_SUSPENDED'`.
- The creator cannot create or update products (POST/PUT /shop/products return 403).
- The creator dashboard **GET /shop/storefront-customization** includes `storeSuspended`, `storeSuspendedAt`, `storeSuspendedReason` so the creator sees their status.

**Schema (StorefrontCustomization):** `storeSuspended` (boolean), `storeSuspendedAt` (Date), `storeSuspendedReason` (string), `storeSuspendedBy` (ref User).

**Admin API:**

- **POST /dashboards/admin/store/suspend** — Body: `{ creatorId, reason? }`. Sets store suspended and logs `store_suspend`.
- **POST /dashboards/admin/store/unsuspend** — Body: `{ creatorId }`. Clears suspension and logs `store_unsuspend`.

Requires admin role.

---

## Remove product

Products can have status **removed** (set by admin). Removed products:

- Are not returned in browse or store product lists (only `active` is shown publicly).
- **GET /shop/products/:id** returns 404 for a removed product.
- Creator cannot update a removed product (PUT returns 404).

**Schema (Product):** `status` enum includes `'removed'`. When admin removes, `meta.removedByAdmin` and optional `meta.removedReason` are set.

**Admin API:**

- **POST /dashboards/admin/products/:id/remove** — Body: `{ reason? }`. Sets product status to `removed`, writes meta, logs `product_remove` with targetType `Product`, targetId productId, meta.creatorId.

Requires admin role.

---

## Freeze payouts

When a creator’s payouts are frozen:

- **POST /payments/payouts/withdraw** and **requestCreatorPayout** return **PAYOUT_FROZEN** (payouts temporarily unavailable).
- Automated payout eligibility skips creators with `CreatorWallet.payoutFrozen === true`.

**Schema (CreatorWallet):** `payoutFrozen` (boolean), `payoutFrozenAt` (Date), `payoutFrozenReason` (string), `payoutFrozenBy` (ref User). Upserted on first freeze.

**Admin API:**

- **POST /dashboards/admin/payouts/freeze** — Body: `{ creatorId, reason? }`. Sets CreatorWallet payout freeze (upsert), logs `payout_freeze`.
- **POST /dashboards/admin/payouts/unfreeze** — Body: `{ creatorId }`. Clears freeze, logs `payout_unfreeze`.

Requires admin role.

---

## Audit seller activity

Admins can view a seller’s store status and recent activity in one call.

**Admin API:**

- **GET /dashboards/admin/sellers/:creatorId/activity** — Query: `limit` (default 50, max 100).

**Response:**

- `creatorId`, `storeSuspended`, `storeSuspendedAt`, `storeSlug`, `payoutFrozen`, `payoutFrozenAt`
- `auditLogs` — AdminAuditLog entries where targetType is `seller` and targetId is creatorId, or meta.creatorId is creatorId (e.g. product_remove for their products).
- `ordersAsSeller` — Paid orders where the seller has items (id, userId, totalCents, status, createdAt).
- `products` — Seller’s products (id, name, status, priceCents, updatedAt).
- `payoutRequests` — Payout requests for this creator (id, amountCents, status, createdAt).

Requires admin role.

---

## Summary

| Action | Endpoint | Body | Audit action |
|--------|----------|------|--------------|
| Suspend store | POST /dashboards/admin/store/suspend | creatorId, reason? | store_suspend |
| Unsuspend store | POST /dashboards/admin/store/unsuspend | creatorId | store_unsuspend |
| Remove product | POST /dashboards/admin/products/:id/remove | reason? | product_remove |
| Freeze payouts | POST /dashboards/admin/payouts/freeze | creatorId, reason? | payout_freeze |
| Unfreeze payouts | POST /dashboards/admin/payouts/unfreeze | creatorId | payout_unfreeze |
| Audit seller | GET /dashboards/admin/sellers/:creatorId/activity | limit? | — |

All mutations are logged to AdminAuditLog with targetType/targetId (and meta.creatorId where relevant) for compliance and fraud prevention.
