# Platform gaps — living review

**Last reviewed:** 2026-03-29  

**Canonical gap inventory:** This file is the **single living source** for high-signal platform gaps (what is missing, partial, stubbed, env-gated, or deferred). Other docs may drill into specifics; when they disagree, **update this file first**, then align the others.

**After each release:** Reconcile with [`docs/GAPS-AND-ROUTES-INDEX.md`](GAPS-AND-ROUTES-INDEX.md) — verify route caveats, redirect-only surfaces, and “where to go deeper” links still match reality; update **Last reviewed** above and that index’s verification note if needed.

---

## How to read status labels

| Label | Meaning |
|--------|--------|
| **Implemented** | Present for intended use; no material caveat recorded here |
| **Implemented with caveat** | Shipped, but coverage, consistency, or ops truth limits apply |
| **Partial** | End-to-end or production-grade behavior incomplete |
| **Stubbed** | Placeholder or dev-oriented behavior exists |
| **Env-gated** | Requires provider keys, flags, or infra |
| **Missing** | Not a real product capability |
| **Deferred / by design** | Not targeted for current runtime or intentionally out of scope |

This document does **not** claim a full static code audit, green CI, or complete production verification.

---

## Recently narrowed (since prior gap index)

Use this section to drain stale “missing” claims; fold items into sections below when they stabilize.

- **Unified payment lookup:** `GET /payments/universal/:id` and `GET /payments/search` resolve **`PayoutRequest`**, **`Chargeback`**, **`PaymentTransaction`** (Mongo `_id`), **`Dispute`** (`_id` | `transactionId`), **`PpvPurchase`** (`_id` | meta payment refs), **`IdempotencyRecord`** (`key`), after PaymentReference / Ledger / Order. **Admin/support** get `operatorContext.paymentProviders`. Sparse indexes: **`PayoutRequest.externalId`**, **`PpvPurchase`** `meta.paymentIntentId` / `meta.stripeSessionId` / `meta.referenceId` (sparse). Wise webhook HMAC compare hardened (length-safe `timingSafeEqual`).
- **Web stub/live honesty:** **`OperationalStubBanner`** reads **`GET /health` → `production_truth`** on **Coin store**, **Wallet**, **Checkout**, **Product detail** (buy now), **Subscribe**, **Pricing**, **Admin** shell, **Admin ops**, **Admin metrics**, **Admin payouts** (admin variant lists JSON detail).
- **For You (discovery):** ranked slate **deduplicates by `contentId`** after business rules and before offset/cursor paging (reduces duplicate cards in a session; does not remove the **200-item pipeline window** cap — see Discovery).
- **OAuth web UX:** Login and Register share **`loadOauthProviderFlags`** (`packages/web/src/lib/oauthProviderLoad.js`, `/auth/oauth/providers` first); Register surfaces **`oauth_error`** query parity with Login.
- **PaymentReference coverage:** `internal` provider for dev stub shop orders (`order:<mongoId>`); `pending` rows upserted when Stripe Checkout sessions are created (shop + buy-now); webhooks still complete status. Not universal lookup — see Payments.
- **Stream metadata:** `PUT /streams/:id/metadata` and `PATCH /live/stream/:streamId` — shared tag normalization, http(s)-only cover/thumbnail URLs, PATCH `meta` key cap, admin audit on privileged PATCH. Remaining gap: long-term **one clear story** for PUT vs PATCH in API docs and clients.
- **Discovery feed (web):** For You hook and vertical feed normalize stable ids, `videoUrl`, and creator labels when `creator` is an object.
- **Wallet / payouts (web):** Trust badges + `/compliance/creator/payout-requirements` checklist and creator-apply link when not payout-ready.
- **Legal / disputes:** Payments policy served at `GET /legal/payments-policy.html`; footer and Terms link; disputes page links to policy.
- **Delivery diagnostics:** `GET /system/delivery` and `GET /api/system/delivery` return email/push **mode** from env (no secrets) — complements `GET /health` / production truth for ops.
- **Support tracking compatibility:** public `GET /ticket/:trackingId` now returns safe `SupportTicket` tracking fields (reduces `Ticket` vs `SupportTicket` divergence for public tracking pages).
- **Unified payment lookup (narrow):** `GET /payments/universal/:id` and `GET /payments/search?reference=` resolve **PaymentReference → LedgerEntry → Order** (best-effort; not every money table). See `docs/PAYMENT-LOOKUP-SCOPE.md`.
- **Feed API honesty:** Discovery and `/api/feed` / `feed/following` responses map items through **hydration** (`contentId`, `videoUrl`, `thumbnailUrl`, optional `creatorName`, `feedItemContractVersion`). Cursors from `@millo/discovery` include `{ o, v: 1 }` for forward-compatible parsing.
- **Release hygiene (this pass):** Vitest config no longer imports `vitest/config` (works with plain object export); `ledger.service` unit tests + `GET /payments/search` auth guard + `GET /ticket/:trackingId` tests (`support-ticket-public.test.js`); root **`npm run db:sync-indexes`** wraps `syncIndexes()`; Vite dev **`/legal` → API** proxy for footer static policy links.
- **Staff support dashboard:** `ticketCreate` writes **`SupportTicket`** (general channel, `MIL-…` tracking); `ticketList` merges legacy **`Ticket`** + **`SupportTicket`** with normalized status; `ticketRespond` tries **`Ticket`** then **`SupportTicket`**.

---

## Implemented with caveat

### Payment reference search

**Status:** **Implemented with caveat**

- `GET /payments/search?reference=`
- `GET /payments/reference/:ref`

**Caveats:**

- Coverage depends on rows in **`PaymentReference`**; not every legacy or processor-only ID is indexed.
- **Not** a universal cross-table, cross-processor lookup (see **Still explicitly missing**).

### Stream metadata APIs

**Status:** **Implemented with caveat**

- `PUT /streams/:id/metadata`
- `PATCH /live/stream/:streamId`

**Caveats:**

- Hardening has landed (tags, URLs, meta size, admin audit on admin PATCH); clients and docs should still be reviewed for **one consistent contract** (field names, error codes).

### Email / push (production posture)

**Status:** **Env-gated / Partial** (ops truth varies by deployment)

- Production rejects **console** email transport unless explicitly allowed (see API env validation and notifications package).
- **Caveat:** Without real SMTP/SendGrid/etc. and push credentials, delivery remains **stubbed / degraded** regardless of UI copy.

---

## Current high-signal gaps (by area)

### Auth

- OAuth: **Env-gated**
- Provider-not-configured UX on web: **Improved** — Login + Register use the same provider flag loader (`/auth/oauth/providers` → system → `/auth/providers`); Register handles `oauth_error` like Login. Other screens may still be uneven.

### Payments

- Unified payment lookup across **all** money tables and processor-native IDs: **Partial** — `GET /payments/universal/:id` and `GET /payments/search` check **nine** collections (PaymentReference → LedgerEntry → Order → PayoutRequest → Chargeback → PaymentTransaction → **Dispute** → **PpvPurchase** → **IdempotencyRecord**). Standalone processor-only mirrors, **TaxRecord** / auction settlement ids, and a **warehouse / unified search index** remain **Missing** if not present in those tables.
- Provider / mode surfaced in JSON for operators: **Improved** — **admin/support** universal, search, and reference responses include `operatorContext.paymentProviders` (incl. `coinPurchasePath`, `wiseWebhook`); `GET /health` `checks.provider_states` unchanged
- Coin checkout without Stripe: **Stubbed / Env-gated** (mode now explicit in `paymentProviders.coinPurchasePath`)
- PayPal / Wise payouts without credentials: **Stubbed / Env-gated**
- Wise (per deeper audit): webhook verification **improved** (safe HMAC compare; `WISE_WEBHOOK_SECRET` required in production); refunds/cancellation paths — still verify `packages/api` before treating as live

### Notifications

- Email without a real provider: **Stubbed / Env-gated**
- Push: **Partial / Env-gated**
- Delivery **mode** diagnostics: **Implemented** (`GET /system/delivery`, `GET /api/system/delivery`) — not a substitute for delivery *logs* or end-to-end probes

### Live

- Filters SDK: **Stubbed**
- Device analytics: **Partial**
- Co-host / WebRTC (Janus): **Partial** — real media path depends on gateway configuration; stub paths exist when off

### Economy / commerce

- Redis lock coverage across **all** ledger-sensitive paths: **Partial**
- Seller verification: **Partial / Stubbed**
- Penalties / reassignment workers: **Partial**

### Fraud / safety

- Cloudflare reputation when off: **Env-gated / Partial**
- AI moderation when provider off: **Stubbed / Env-gated**
- KYC when provider off: **Stubbed / Env-gated**
- UI “live vs stub” honesty: **Partial** — banners + badges on **coins, wallet, checkout, product detail, subscribe, pricing, admin ops/metrics/payouts**; other surfaces may still omit explicit mode

### Infrastructure

- Kafka as primary application bus: **Deferred / not current runtime** — see **Architecture boundary** in **Still explicitly missing**
- SQL ledger as primary live money path: **Not primary** (Mongo remains primary) — same boundary note

### Observability

- Worker / queue dashboards: **Partial**
- Bundled ELK/Loki in repo: **Deferred / by design**

### Mobile

- Live filters: **Stubbed**
- Milla voice / AI chat: **Partial / Missing by area**

### Discovery

- Stable **infinite** For You as real product behavior: **Partial** — ranking slate dedupes **contentId** before paging; **FOR_YOU_MAX_WINDOW** (200) and cursor/offset semantics still cap how far a client can page without refresh
- Full feed hydration for **every** row: **Partial / Missing**
- Subscription tier CRUD: **Partial**
- Filter version pinning end-to-end: **Partial**
- Cursor paging: **best-effort**; not guaranteed stable under churn

### Admin

- AI controls persistence: **Read-only in practice / Partial**
- Shadow vs kill-switch alignment: **Partial**
- Some admin surfaces: **Partial / Env-gated**

### Web / product

- Seller onboarding: **Stubbed / provider-dependent**
- Locale parity (i18n): **Partial**
- DEV staff toggles: **Not production RBAC**

### Support

- `Ticket` vs `SupportTicket`: **Partial / Bridged** — public `GET /ticket/:trackingId` uses **`SupportTicket`**; staff **`/dashboards/support/tickets`** creates **`SupportTicket`** and lists/responds across **legacy `Ticket` + `SupportTicket`** until legacy rows age out.
- Order-linked support ownership: **Ambiguous** (clarified in `docs/SUPPORT-ORDER-OWNERSHIP.md` ID glossary; `orderId` on **`SupportTicket`** is not a ticket Mongo `_id`).

---

## Still explicitly missing (structural / large)

These are **not** “tweak in a day” items; they stay here until a deliberate program delivers them.

1. **Universal / generic payment lookup** across **every** money record and native processor ID (single query / search index / warehouse story) — **narrow** nine-collection API exists; full coverage and historical backfill remain **Missing** without `PaymentReference` on every path and/or a warehouse.
2. **Stable infinite For You** as defined product behavior (ordering, **tail** behavior under load, behavior beyond the ranked window) — **deduplication within the ranked slate** is implemented; unbounded infinite scroll as a **product guarantee** is still **Missing**.
3. **Guaranteed full feed hydration** for every feed row (all URLs, creator fields, typing consistency **from ranking pipeline**, not only wire shaping).
4. **Kafka** as primary application event bus — **out of scope for this repository’s runtime** (see **Architecture boundary** below). Use external streaming infra if required.
5. **Bundled ELK/Loki** (or equivalent) **in repo** — **out of scope for this repository**; operators bring their own observability stack.
6. **SQL ledger** as **primary** live persistence for money movement — **out of scope**; Mongo remains system-of-record for money in this codebase unless product approves a migration program.

**Do not overbuild without product sign-off:** Do not present multi-table lookup as a **complete** warehouse substitute, and do not add Kafka/ELK/SQL-primary **into this repo** solely to clear this list without an approved architecture change.

### Architecture boundary (production-grade posture for *this* repo)

For deployments at **https://milloapp.com**, “production-grade” is defined to include: real provider keys where money/notifications apply, `GET /health` / `production_truth` honesty in product UI, operator lookup APIs above, and external observability (metrics, logs, traces) **operated outside** this monorepo. **Kafka**, **bundled ELK/Loki**, and **SQL-primary ledger** are **intentionally not** delivered as in-repo product requirements; treat them as optional ecosystem choices, not gaps to “fix” by default in tree.

---

## Verification note

Maintainers: when you close or narrow a gap in code, update **Recently narrowed** or the relevant section **in this file** in the same PR. On release branches, run the **reconciliation** step with `GAPS-AND-ROUTES-INDEX.md` as described at the top.
