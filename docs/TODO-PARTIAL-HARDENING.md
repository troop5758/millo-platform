# TODO — PARTIAL HARDENING

Cross-cutting hardening for **stub / env-gated / partial** behavior. No new architecture.

---

## Auth

- [ ] Show explicit “OAuth not configured” / provider-disabled messaging
- [ ] Do not redirect blindly into broken provider flows
- [ ] Standardize structured error codes on API where missing (`provider_unconfigured`, etc.)

## Payments

- [ ] Return consistent **`mode` / `providerConfigured`** in JSON on money surfaces that drive UI (beyond headers/`/health` where needed)
- [ ] Block fake “live success” UI when stub or unconfigured

## Notifications

- [x] Public delivery **mode** diagnostics: **`GET /system/delivery`** and **`GET /api/system/delivery`** (email/push from env — no secrets). See **`docs/PLATFORM-GAPS.md`** → Recently narrowed.
- [ ] Extend diagnosics only if product needs more than `health` + `system/delivery` + production truth (avoid duplicate surfaces)

## Live

- [ ] Label filters as basic / stub where true
- [ ] Harden metadata routes (see `docs/TODO-LIVE.md`) — do not re-list metadata API as missing
- [ ] Scope minimal co-host and device analytics contracts only

## Commerce

- [ ] Extend Redis locks beyond coin confirm: payouts, settlement, reassignment hotspots (inventory first)
- [ ] Document which paths already use **`withRedisLock`** vs economy’s internal lock utilities

## Fraud

- [ ] Expose provider states consistently: **`ai`**, **`kyc`**, Cloudflare (stub/live/disabled)
- [ ] Surface in admin/ops UI where users could confuse stub with live enforcement

## Discovery

- [ ] API already may return **`pagingMode`** / cap — keep UI aligned; do not imply stable infinite paging
- [ ] Keep **`hasMore`** honest; do not imply endless feed

## Admin

- [ ] Mark AI controls as **read-only** until persistence exists (501 / env-backed truth)
- [ ] Align shadow vs kill-switch vocabulary with docs

## Web

- [ ] Fallback UI for missing thumbnails/videos on feed rows
- [ ] Stub-mode banners on money flows where API indicates stub
- [ ] Do not present **`PaymentReference`** search as universal lookup

## Support

- [ ] Map **`Ticket`** vs **`SupportTicket`** fields and routes (see `docs/TODO-SUPPORT-MODEL.md`)

## i18n / DEV

- [ ] Locale parity for new keys
- [ ] DEV staff toggles clearly labeled — not production RBAC
