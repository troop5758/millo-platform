# Store Analytics

Creators see store-level metrics for their shop: **Store Views**, **Product Clicks**, **Conversion Rate**, **Top Products**, and **Revenue**.

Example: *Views: 12,302 · Conversion: 4.1% · Revenue: $8,432*

---

## Metrics

| Metric | Description |
|--------|-------------|
| **Store Views** | Number of storefront page loads (recorded via POST view endpoint). |
| **Product Clicks** | Number of product clicks on the store (recorded via POST click endpoint). |
| **Conversion Rate** | `(orderCount / storeViews) * 100` over the selected date range. Percentage with 2 decimal places. |
| **Top Products** | Products ranked by revenue in the period (productId, name, quantitySold, revenueCents). Max 20. |
| **Revenue** | Sum of creator share of order totals (from paid orders) in the period. |

All daily aggregates are stored in **StoreAnalytics** (creatorId, date, storeViews, productClicks, orderCount, revenueCents). Revenue and order count are updated when an order is completed (Stripe webhook or dev stub).

---

## Schema

**StoreAnalytics** (per creator, per day):

- `creatorId` — ref User
- `date` — start of day (UTC)
- `storeViews` — count of store view events
- `productClicks` — count of product click events
- `orderCount` — number of paid orders that included this creator’s products
- `revenueCents` — sum of (priceCents × qty) for this creator’s items in those orders

Schema: `packages/database/src/schemas/StoreAnalytics.js`.

---

## API

### Record store view (public)

Called by the frontend when the creator’s storefront page is viewed (e.g. once per session or per load).

```http
POST /shop/creator/:creatorId/analytics/view
```

No body. Rate-limited (e.g. 120/minute per IP). Returns 204.

### Record product click (public)

Called when a user clicks a product on the store.

```http
POST /shop/creator/:creatorId/analytics/click
Content-Type: application/json

{ "productId": "<productId>" }
```

`productId` must be an active product belonging to `creatorId`. Rate-limited. Returns 204 or 404 if product not found.

### Get store analytics (auth)

Creator dashboard: views, clicks, conversion, top products, revenue for a date range.

```http
GET /shop/analytics?startDate=2025-01-01&endDate=2025-01-31
Authorization: Bearer <token>
```

**Query:**

- `startDate`, `endDate` — ISO date strings. Default: last 30 days.

**Response:**

```json
{
  "storeViews": 12302,
  "productClicks": 4521,
  "conversionRate": 4.1,
  "orderCount": 504,
  "revenueCents": 843210,
  "revenue": "$8,432.10",
  "topProducts": [
    { "productId": "...", "name": "Product A", "quantitySold": 120, "revenueCents": 24000 }
  ],
  "startDate": "2025-01-01T00:00:00.000Z",
  "endDate": "2025-01-31T00:00:00.000Z"
}
```

Requires storefront eligibility. Returns 403 `STOREFRONT_RESTRICTED` if not eligible.

---

## Recording flow

1. **Views:** Frontend loads store page → call `POST /shop/creator/:creatorId/analytics/view` (e.g. once per visit).
2. **Clicks:** User clicks a product → call `POST /shop/creator/:creatorId/analytics/click` with `productId`.
3. **Orders:** When an order is paid (Stripe `checkout.session.completed` or dev stub), `createOrderFromItems` creates the order and then `recordOrderForStoreAnalytics(order)` updates StoreAnalytics for each creator in the order (orderCount and revenueCents per creator for that day).

Conversion rate is computed on read: `(orderCount / storeViews) * 100` over the requested range. Top products are computed from Order items (paid orders, items.creatorId = creator) in the same date range.
