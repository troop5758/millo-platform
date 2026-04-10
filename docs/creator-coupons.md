# Creator Coupons

Creators can create **discount codes** for their store (e.g. `SAULO10` → 10% off, `LIMITEDDROP` → $5 off). Codes are validated at checkout and redemption is tracked.

---

## Schema

**CreatorCoupon** (per creator):

| Field | Type | Description |
|-------|------|-------------|
| `creatorId` | ObjectId | Creator who owns the coupon (ref User). |
| `code` | String | Uppercase, unique per creator; max 64 chars. |
| `discountType` | `"percent"` \| `"fixed"` | Percent off (0–100) or fixed amount off in cents. |
| `amount` | Number | For percent: 0–100. For fixed: positive integer (cents). |
| `expiresAt` | Date | Optional; null = no expiry. |
| `maxRedemptions` | Number | Optional; null = unlimited. |
| `redemptionCount` | Number | Incremented when an order using this coupon is paid. |
| `active` | Boolean | If false, code is invalid. |
| `meta` | Mixed | Optional extra. |

Schema: `packages/database/src/schemas/CreatorCoupon.js`.

---

## API

### Validate code (public, used at checkout)

```http
POST /shop/coupons/validate
Content-Type: application/json

{ "creatorId": "<creatorId>", "code": "SAULO10" }
```

**Response (valid):**

```json
{
  "valid": true,
  "coupon": {
    "_id": "...",
    "code": "SAULO10",
    "discountType": "percent",
    "amount": 10
  }
}
```

**Response (invalid):** `{ "valid": false, "message": "Invalid or inactive code" }` (or expired / max redemptions reached).

### List my coupons (auth)

```http
GET /shop/coupons
Authorization: Bearer <token>
```

Requires storefront eligibility. Returns `{ coupons: [...] }`.

### Create coupon (auth)

```http
POST /shop/coupons
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "SAULO10",
  "discountType": "percent",
  "amount": 10,
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "maxRedemptions": 100
}
```

- **code** — required; stored uppercase; unique per creator.
- **discountType** — `percent` or `fixed`.
- **amount** — percent: 0–100; fixed: positive integer (cents).
- **expiresAt** — optional ISO date; omit for no expiry.
- **maxRedemptions** — optional; omit for unlimited.

Returns 409 `CODE_EXISTS` if code already exists for this creator.

### Update coupon (auth, owner)

```http
PATCH /shop/coupons/:id
Authorization: Bearer <token>
Content-Type: application/json

{ "amount": 15, "expiresAt": null, "maxRedemptions": 200, "active": true }
```

Only sent fields are updated.

### Deactivate coupon (auth, owner)

```http
DELETE /shop/coupons/:id
Authorization: Bearer <token>
```

Sets `active: false`; does not delete the document.

---

## Checkout integration

**POST /payments/shop/checkout** accepts optional body fields:

- **couponCode** — string (e.g. `SAULO10`).
- **creatorId** — creator ID the coupon belongs to (must match cart when using a coupon).

**Rules:**

1. Coupon can only be applied when **all items in the cart are from the same creator**, and that creator matches the coupon’s `creatorId`.
2. Discount is applied to the cart subtotal:
   - **percent:** `discountCents = round(subtotalCents * amount / 100)`.
   - **fixed:** `discountCents = min(amount, subtotalCents)`.
3. Stripe Checkout shows a “Discount (CODE)” line item (negative amount) so the charged total equals subtotal minus discount.
4. When the payment succeeds (Stripe webhook `checkout.session.completed`), the order is created with `meta.couponId` and the coupon’s `redemptionCount` is incremented.

**Errors:** `COUPON_SINGLE_CREATOR`, `COUPON_CREATOR_MISMATCH`, `COUPON_INVALID`, `COUPON_EXPIRED`, `COUPON_MAX_REDEEMED`.

---

## Summary

| Action | Endpoint | Auth |
|--------|----------|------|
| Validate code | POST /shop/coupons/validate | No |
| List my coupons | GET /shop/coupons | Yes (storefront eligible) |
| Create coupon | POST /shop/coupons | Yes (storefront eligible) |
| Update coupon | PATCH /shop/coupons/:id | Yes (owner) |
| Deactivate coupon | DELETE /shop/coupons/:id | Yes (owner) |
| Apply at checkout | POST /payments/shop/checkout (body: couponCode, creatorId) | Yes |

All coupon management is gated by the same storefront eligibility used for products and storefront customization.
