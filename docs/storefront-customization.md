# Creator Storefront Customization System

Creators can choose a **storefront layout theme** and optional theme-specific config. The frontend uses this to render the creator’s shop page (e.g. `/creator/:id/shop`).

## Layout themes

| Theme | Style | Description |
|-------|--------|-------------|
| **grid_store** | eBay style | Product grid, filters, categories. |
| **creator_brand** | Shopify style | Banner, featured products, collections. |
| **live_seller** | TikTok Shop style | Live video pinned, products under livestream. |
| **auction_house** | Auction focus | Featured auctions, countdown timers. |

### 1. Grid Store (eBay style)

- **Product grid** — Main content is a grid of products.
- **Filters** — Optional filters (e.g. price, category). Config: `showFilters` (boolean).
- **Categories** — Category sidebar or dropdown. Config: `showCategories` (boolean), `categoryOrder` (array of category strings for order).

**Config keys:** `showFilters`, `showCategories`, `categoryOrder` (array).

### 2. Creator Brand Page (Shopify style)

- **Banner** — Hero image at top. Config: `bannerImageUrl` (string URL).
- **Featured products** — Curated product IDs. Config: `featuredProductIds` (array of Product `_id`).
- **Collections** — Grouped products (e.g. by category or custom labels). Config: `collectionNames` (array of strings; each can map to a category or custom collection label).

**Config keys:** `bannerImageUrl`, `featuredProductIds` (array), `collectionNames` (array).

### 3. Live Seller Layout (TikTok Shop style)

- **Live video pinned** — Pinned livestream at top. Config: `pinnedLiveStreamId` (optional; if omitted, show latest live).
- **Products under livestream** — Product strip or grid below the live player. Config: `showProductsUnderLive` (boolean).

**Config keys:** `pinnedLiveStreamId` (optional), `showProductsUnderLive` (boolean).

### 4. Auction House Layout

- **Featured auctions** — Highlight specific auctions. Config: `featuredAuctionIds` (array of Auction `_id`).
- **Countdown timers** — Show time remaining. Config: `showCountdown` (boolean, default true).

**Config keys:** `featuredAuctionIds` (array), `showCountdown` (boolean).

---

## Custom storefront branding

Creators can customize their **brand identity** via the `storefrontTheme` object.

| Element | Field | Description |
|--------|--------|-------------|
| Store banner | `bannerUrl` | Large header image URL. |
| Store logo | `logoUrl` | Brand logo URL. |
| Accent color | `accentColor` | Buttons / highlights (hex or CSS color). |
| Background theme | `backgroundTheme` | `light` or `dark`. |
| Background color | `backgroundColor` | Optional custom background (hex). |
| Font style | `fontFamily` | Optional brand typography (CSS font-family). |
| Store description | `description` | Creator story / store bio (max 2000 chars). |

**Example JSON:**

```json
{
  "storefrontTheme": {
    "bannerUrl": "https://cdn.example.com/banner.jpg",
    "logoUrl": "https://cdn.example.com/logo.png",
    "accentColor": "#6366f1",
    "backgroundTheme": "dark",
    "backgroundColor": "#0f172a",
    "fontFamily": "Inter, sans-serif",
    "description": "Welcome to my store. Handmade items and limited drops."
  }
}
```

All fields are optional; partial updates are supported (send only the keys you want to change).

---

## Store sections (drag-and-drop)

Creators can **arrange sections** like a landing-page builder. The **order of the array** is the order sections appear on the storefront.

**Section types:**

| Type | Description |
|------|-------------|
| `hero_banner` | Hero banner |
| `featured_products` | Featured products |
| `product_grid` | Product grid |
| `collections` | Collections |
| `live_stream` | Live stream |
| `upcoming_auctions` | Upcoming auctions |
| `creator_video` | Creator video |
| `reviews` | Customer reviews |

Each section item can include optional `title` (max 120 chars), `limit` (1–50 for product/auction counts), and `meta` (extra options).

**Example configuration:**

```json
{
  "storeLayout": [
    { "type": "hero_banner" },
    { "type": "featured_products", "title": "Picks for you", "limit": 8 },
    { "type": "live_stream" },
    { "type": "product_grid", "title": "All products" },
    { "type": "reviews" }
  ]
}
```

When `storeLayout` is empty or not set, the frontend can use a default order or the layout theme’s default.

---

## Mobile storefront experience

On **mobile**, the storefront uses a dedicated section order for a consistent, thumb-friendly layout. The API returns **mobileSectionOrder**: an array of section type strings in the order the mobile app should render.

**Default mobile layout (top to bottom):**

1. **Creator Banner** — `hero_banner` (store banner, logo, description). The **Follow** button is rendered here in the creator header/banner area (not a separate section).
2. **Products** — `featured_products` then `product_grid` (pinned products, then full grid).
3. **Collections** — `collections`.
4. **Live Stream** — `live_stream` (when creator is live; otherwise section is hidden or shows "Not live").
5. **Reviews** — `reviews`.

**Response field:** `mobileSectionOrder`: `['hero_banner', 'featured_products', 'product_grid', 'collections', 'live_stream', 'reviews']`. Mobile clients should render sections in this order; omit or collapse sections that have no data (e.g. hide live_stream when not live). The Follow button is a UI element in the creator banner/header, not a section type.

---

## Featured products

Creators can **pin products to the top** of the store (e.g. a "⭐ Featured" block). The **order of the array** is the display order.

**Schema:** `featuredProducts: [ ObjectId, ObjectId, ... ]` — array of Product `_id`s. Max 12. Only the creator's own **active** products are accepted; invalid or non-owned IDs are dropped on save.

**Example:** ⭐ Featured → Product 1, Product 2, Product 3. **PUT body:** send `featuredProducts` as an array of product ID strings; API validates ownership and active status.

---

## Collections (product categories)

Creators can **organize products into collections** (categories) with a name, description, and list of product IDs.

**Schema (each item):**

- `name` — String (required, max 120 chars).
- `description` — String (optional, max 500 chars).
- `productIds` — [ ObjectId ] (ref Product). Max 100 per collection; max 20 collections. Only the creator's **active** products are stored; invalid/other IDs are dropped on save.

**Example:**

- Electronics  
- Streetwear  
- Collectibles  
- Limited Drops  

**PUT body:** send `collections` as an array of `{ name, description?, productIds? }`. Order of array = display order. API validates product ownership; each collection gets a new `_id` on save (full replace).

---

## Creator promo video

Creators can **place a video at the top of the store** to welcome visitors and drive conversions (e.g. "Welcome to my store! Watch my video → buy products").

**Schema:** `promoVideo: { videoUrl?, title?, thumbnailUrl?, ctaText? }`. All optional; if at least one of `videoUrl`, `title`, or `ctaText` is set, the promo block is shown.

- **videoUrl** — Playback or embed URL (internal or external). Max 2048 chars.
- **title** — e.g. "Welcome to my store!". Max 200 chars.
- **thumbnailUrl** — Optional cover image. Max 2048 chars.
- **ctaText** — Call-to-action, e.g. "Watch my video → buy products". Max 120 chars.

Send `promoVideo: null` or an empty object to remove the promo. This placement can dramatically increase conversions.

---

## Store ratings & trust badges

Important for **buyer confidence**. Creators can display ratings and trust badges (e.g. ✔ Verified Seller, ✔ Fast Shipping, ✔ Top Creator, 5⭐ Rating).

**Schema:** `storeMetrics: { rating?, reviewCount?, verifiedSeller?, fastShipping?, topCreator? }`

- **rating** — Number 0–5 (e.g. star rating). Optional; null when not set.
- **reviewCount** — Number of reviews. Default 0.
- **verifiedSeller** — Boolean. ✔ Verified Seller badge.
- **fastShipping** — Boolean. ✔ Fast Shipping badge.
- **topCreator** — Boolean. ✔ Top Creator badge.

**Example badges:** ✔ Verified Seller | ✔ Fast Shipping | ✔ Top Creator | 5⭐ Rating (from `rating` + `reviewCount`).  
PUT accepts `storeMetrics`; sent keys are merged with existing (partial update). Rating can be computed from real reviews in a later phase; for now it is stored.

---

## Data model

**StorefrontCustomization** (one per creator):

- `creatorId` — ref User, unique.
- `storeSlug` — optional unique URL slug (e.g. `saulo`) for milloapp.com/store/:slug and milloapp.com/@:slug/store. Lowercase, 2–64 chars, `[a-z0-9_-]`.
- `layoutTheme` — enum: `grid_store` | `creator_brand` | `live_seller` | `auction_house` (default `grid_store`).
- `config` — mixed object; keys depend on layout theme (see above).
- `storefrontTheme` — sub-document: `bannerUrl`, `logoUrl`, `accentColor`, `backgroundTheme` (`light`|`dark`), `backgroundColor`, `fontFamily`, `description`.
- `storeLayout` — array of section objects: `{ type, title?, limit?, meta? }`. Order = display order. Max 30 sections.
- `featuredProducts` — array of Product ObjectIds (pinned to top of store). Max 12; only creator's active products.
- `collections` — array of `{ _id, name, description, productIds }`. Max 20 collections; max 100 products per collection. Only creator's active products.
- `promoVideo` — sub-document: `videoUrl`, `title`, `thumbnailUrl`, `ctaText`. Optional; shown at top of store when set.
- `storeMetrics` — sub-document: `rating` (0–5), `reviewCount`, `verifiedSeller`, `fastShipping`, `topCreator`. For trust badges.
- `meta` — optional extra.

Schema: `packages/database/src/schemas/StorefrontCustomization.js`.

---

## Storefront URL (custom slug)

Each creator can set a unique **store slug** (e.g. `saulo`) so their store is available at:

- **https://milloapp.com/store/saulo**
- **https://milloapp.com/@saulo/store** (same slug, different path style)

**Slug rules:** 2–64 characters, lowercase letters, numbers, hyphens, underscores. Must be unique; some slugs are reserved (`store`, `api`, `admin`, `shop`, etc.). Set via **PUT /shop/storefront-customization** with body `{ "storeSlug": "saulo" }` (or `null` to clear).

**Resolve by slug:**

- **GET /shop/store/:slug** — returns `{ creatorId, slug }`. Use when the frontend only needs the creator ID (e.g. to call other APIs).
- **GET /shop/store/:slug/storefront-config** — returns the same payload as **GET /shop/creator/:creatorId/storefront-config** (full config in one call). Returns 404 if no store has that slug.

Storefront config responses (by creatorId or by slug) include **storeSlug** when set. Creator dashboard GET/PUT **/shop/storefront-customization** also return **storeSlug**.

---

## API

### Get storefront config (public)

```http
GET /shop/creator/:creatorId/storefront-config
```

Returns the layout and config for that creator (for rendering the storefront page).

**Alternative (by URL slug):**

```http
GET /shop/store/:slug/storefront-config
```

Same response; use when the page URL is `/store/saulo` or `/@saulo/store`. Returns 404 if slug is not found.

**Response:**

- `creatorId` — creator id.
- `layoutTheme` — current theme.
- `config` — theme config object.
- `storefrontTheme` — branding: `bannerUrl`, `logoUrl`, `accentColor`, `backgroundTheme`, `backgroundColor`, `fontFamily`, `description`.
- `storeLayout` — array of section objects (order = display order).
- `featuredProducts` — array of product ID strings (pinned to top).
- `collections` — array of `{ _id, name, description, productIds }`.
- `promoVideo` — `{ videoUrl, title, thumbnailUrl, ctaText }` or null.
- `storeMetrics` — `{ rating, reviewCount, verifiedSeller, fastShipping, topCreator }`.
- `layoutOptions` — array of `{ value, label }` for theme picker UI.
- `sectionTypes` — array of `{ value, label }` for section picker (drag-and-drop builder).
- `mobileSectionOrder` — array of section type strings for mobile layout order (Creator Banner → Products → Collections → Live Stream → Reviews; Follow button in banner).

### Get my storefront customization (auth)

```http
GET /shop/storefront-customization
Authorization: Bearer <token>
```

Returns the authenticated creator’s customization.

**Response:** `creatorId`, `layoutTheme`, `config`, `storefrontTheme`, `storeLayout`, `featuredProducts`, `collections`, `promoVideo`, `storeMetrics`.

### Update my storefront customization (auth)

```http
PUT /shop/storefront-customization
Authorization: Bearer <token>
Content-Type: application/json

{
  "layoutTheme": "creator_brand",
  "config": { "featuredProductIds": ["..."], "collectionNames": ["New Arrivals"] },
  "storefrontTheme": {
    "bannerUrl": "https://cdn.example.com/banner.jpg",
    "logoUrl": "https://cdn.example.com/logo.png",
    "accentColor": "#6366f1",
    "backgroundTheme": "dark",
    "fontFamily": "Inter, sans-serif",
    "description": "Welcome to my store."
  },
  "storeLayout": [
    { "type": "hero_banner" },
    { "type": "featured_products", "limit": 8 },
    { "type": "product_grid" },
    { "type": "reviews" }
  ]
}
```

- **layoutTheme** — optional; must be one of `grid_store`, `creator_brand`, `live_seller`, `auction_house`.
- **config** — optional; object. Full replace.
- **storefrontTheme** — optional; object. Partial merge (only sent keys are updated).
- **storeLayout** — optional; array of `{ type, title?, limit?, meta? }`. Full replace. Max 30 sections; invalid types omitted.
- **featuredProducts** — optional; array of product ID strings. Full replace. Max 12; only creator’s active products are stored; invalid/other IDs dropped.
- **collections** — optional; array of `{ name, description?, productIds? }`. Full replace. Max 20 collections; max 100 products per collection; only creator's active products kept.
- **promoVideo** — optional; object `{ videoUrl?, title?, thumbnailUrl?, ctaText? }` or null to clear. Full replace.
- **storeMetrics** — optional; object `{ rating?, reviewCount?, verifiedSeller?, fastShipping?, topCreator? }`. Partial merge; only sent keys are updated.

Requires storefront eligibility (creator reputation score). Returns 403 `STOREFRONT_RESTRICTED` if not eligible.

**Response:** `creatorId`, `layoutTheme`, `config`, `storefrontTheme`, `storeLayout`, `featuredProducts`, `collections`, `promoVideo`, `storeMetrics`.

---

## Live shopping integration

When the creator is **live**, the storefront can show a TikTok-style block: **LIVE NOW**, video player, and **products featured in stream** with Buy Now buttons.

**Flow:**

1. **Storefront** calls `GET /shop/creator/:creatorId/live-shopping`. If `liveNow === true`, response includes `stream` (playbackUrl, title, thumbnailUrl, featuredProductIds) and `products` (product details for the strip). If not live, `liveNow === false`.
2. **Creator**, while live, sets which products are “featured” via **PATCH /live/stream/:streamId** with body `{ featuredProductIds: ["id1", "id2", ...] }`. Max 20 products; only the creator’s active products are stored.
3. **LiveStream** schema has `featuredProductIds: [ObjectId]` (ref Product). The storefront and live overlay use this for the Buy Now strip.

**Example storefront block when live:**

```
LIVE NOW
[ Video player ]

Products featured in stream
[ Product 1 ] [ Product 2 ] [ Product 3 ]
  Buy Now       Buy Now       Buy Now
```

This mimics TikTok Live Shopping and increases conversions.

---

## Creator coupons

Creators can create discount codes (e.g. `SAULO10` → 10% off, `LIMITEDDROP` → $5 off). Codes are managed via **GET/POST/PATCH/DELETE /shop/coupons** (auth, storefront eligible). Shoppers validate a code with **POST /shop/coupons/validate** (body: `creatorId`, `code`). At checkout (**POST /payments/shop/checkout**), optional body fields `couponCode` and `creatorId` apply the discount when the cart is single-creator and matches the coupon; redemption is tracked when the order is paid. See **docs/creator-coupons.md** for schema, API, and checkout behavior.

---

## Store moderation & safety (admin)

Admins can **suspend store**, **remove product**, **freeze payouts**, and **audit seller activity** for fraud prevention. All actions are logged. See **docs/store-moderation-safety.md** for schema, admin API, and audit behaviour.

---

## Store analytics

Creators can see **Store Views**, **Product Clicks**, **Conversion Rate**, **Top Products**, and **Revenue** for their store. The frontend records views with **POST /shop/creator/:creatorId/analytics/view** and product clicks with **POST /shop/creator/:creatorId/analytics/click** (body: `productId`). The creator dashboard calls **GET /shop/analytics** (auth, query: `startDate`, `endDate`) to get aggregated metrics. Revenue and order count are updated automatically when orders are paid. See **docs/store-analytics.md** for schema and API details.

---

## Frontend usage

1. **Public shop page** (`/creator/:id/shop`): Call `GET /shop/creator/:id/storefront-config`, then render using `layoutTheme`, `config`, `storefrontTheme`, and `storeLayout` (section order). When `storeLayout` is non-empty, render sections in that order; otherwise use layout-theme defaults. Call `GET /shop/creator/:id/live-shopping`; when `liveNow` is true, show the LIVE NOW block (video player + products with Buy Now) at the top or in the `live_stream` section.
2. **Creator dashboard (customize storefront)**: Call `GET /shop/storefront-customization` to load current values; on save, call `PUT /shop/storefront-customization` with `layoutTheme`, `config`, `storefrontTheme`, `storeLayout`, `featuredProducts`, and/or `collections`. Use drag-and-drop to reorder `storeLayout` and send the new array.
3. **Layout options**: Use `layoutOptions` and `sectionTypes` from the public config response for the theme selector and section builder.

---

## Summary

| Layout | Main elements | Config |
|--------|----------------|--------|
| Grid Store | Product grid, filters, categories | showFilters, showCategories, categoryOrder |
| Creator Brand | Banner, featured products, collections | bannerImageUrl, featuredProductIds, collectionNames |
| Live Seller | Pinned live, products under stream | pinnedLiveStreamId, showProductsUnderLive |
| Auction House | Featured auctions, countdowns | featuredAuctionIds, showCountdown |

All config keys are optional; defaults can be applied in the frontend or backend when missing.
