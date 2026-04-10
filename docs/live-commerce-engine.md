# Live Commerce Engine

The platform combines three systems into one unified pipeline:

- **Video Streaming** (WebRTC / RTMP → HLS playback)
- **E-commerce** (Orders / Payments / Shop)
- **Real-time Engagement** (Chat / Reactions / Gifts)

= **LIVE COMMERCE ENGINE**

This doc maps that concept to Millo’s implementation and lists critical frontend behavior.

---

## 1. Frontend layer (client apps)

| Platform | Implementation | Notes |
|----------|----------------|------|
| **Web** | React (packages/web) | StreamPlayerPage, ShopfrontPage, CheckoutPage, LiveNowPage |
| **Mobile** | React Native (packages/mobile) | LiveScreen (HLS player), CoinStoreScreen, shop flows |
| **Creator Studio** | Web dashboard | Stream go-live, PATCH stream (featuredProductIds), storefront customization |

---

## 2. Key modules and where they live

| Module | Purpose | Location / API |
|--------|--------|----------------|
| **LivePlayer** | Low-latency video playback | Web: `VideoPlayer.jsx` (HLS), `StreamPlayerPage.jsx`. Mobile: `LiveScreen.js` (Video + HLS). Stream URL: `stream.playbackUrl` / `streamUrl` from GET `/content/streams/:id` or live API. |
| **ProductOverlay** | Products shown during livestream; “Buy Now” | Web: `ProductDrop.jsx` (product name, price, Buy Now link). `AuctionPanel.jsx` for live auctions. Products in stream: `LiveStream.featuredProductIds`; API: GET `/shop/creator/:creatorId/live-shopping` (stream + products). Creator sets list: PATCH `/live/stream/:streamId` body `{ featuredProductIds }`. |
| **ChatPanel** | Real-time chat + reactions | Web: `LiveChat.jsx` — WebSocket `/live/ws?streamId=`, chat history GET `/live/stream/:streamId/chat`, moderator mute/reactions/gifts. Used in `StreamPlayerPage` and `LiveNowPage` WatchModal. |
| **GiftSystem** | Send gifts during live; floaters + activity | Web: `GiftPanel.jsx`, `GiftFloaters.jsx`, `EmojiRain.jsx`. Send via WebSocket; `handleSendGift` / `handleGiftReceived`. Coins deducted via economy/gift APIs. |
| **CheckoutModal** | Instant checkout (no full-page redirect) | Currently: “Buy Now” from ProductDrop links to product page; product page uses POST `/payments/shop/buy-now` then redirect to Stripe. **Recommended:** Add a modal on stream page that calls buy-now and redirects to Stripe (or in-app success) so the user never leaves the live view. |
| **StorefrontPage** | Creator shop + live-shopping block | Web: `ShopfrontPage.jsx`. API: GET `/shop/creator/:id/storefront-config`, GET `/shop/creator/:id/live-shopping`. When live: show “LIVE NOW”, video player, and products with Buy Now. |

---

## 3. Critical behavior

| Behavior | Status | Notes |
|----------|--------|--------|
| **Video plays instantly (low latency)** | Supported | HLS playback via `playbackUrl` / `streamUrl`; player uses native or MSE. For lower latency, ingest can use WebRTC/RTMP and serve LL-HLS or similar when available. |
| **Products sync with livestream in real time** | Supported | Creator sets `featuredProductIds` via PATCH stream; clients get products from GET `/shop/creator/:creatorId/live-shopping`. Product “drops” in chat can set overlay via LiveChat `onProductDrop` → `ProductDrop`. |
| **“Buy Now” opens instant checkout (no page reload)** | Partial | Buy Now from product page uses POST `/payments/shop/buy-now` (single-product checkout) then redirect to Stripe. From **live overlay** (ProductDrop), Buy Now currently links to product page. For true “no page reload” on live: add a **CheckoutModal** that opens on Buy Now from overlay, calls buy-now, then redirects to Stripe (or shows success in modal) so the viewer stays on the stream. |

---

## 4. API quick reference (live commerce)

- **Stream + playback:** GET `/content/streams/:id` or live equivalent → `playbackUrl`, `status`, `userId` (creator).
- **Products featured in stream:** GET `/shop/creator/:creatorId/live-shopping` → `liveNow`, `stream`, `products` (with `_id`, `name`, `priceCents`, etc.).
- **Set products in stream (creator):** PATCH `/live/stream/:streamId` body `{ featuredProductIds: ["id1","id2",...] }` (max 20).
- **Single-product checkout:** POST `/payments/shop/buy-now` body `{ productId, qty?, shipping? }` → order + Stripe redirect or session.
- **Cart checkout:** POST `/payments/shop/checkout` body `{ items: [{ productId, qty }], shipping?, couponCode?, creatorId? }`.
- **Live WebSocket:** Connect to `/live/ws?streamId=` for chat, gifts, reactions, product-drop events, moderator state.

---

## 5. Recommended enhancement: instant Buy Now from overlay

To match “Buy Now opens instant checkout (no page reload)”:

1. **CheckoutModal component** (e.g. on StreamPlayerPage): accepts `product` (id, name, priceCents, imageUrl), `creatorId`; on confirm, call POST `/payments/shop/buy-now` with `productId`, then open Stripe redirect (or in-app success) and close modal.
2. **ProductDrop** (and any “Buy Now” strip on live): instead of `<Link to={productUrl}>`, use a button that opens `CheckoutModal` with that product and creatorId. Optionally keep “View product” link for users who want the full product page.

This keeps the viewer on the live stream while completing purchase, aligning with the Live Commerce Engine behavior.
