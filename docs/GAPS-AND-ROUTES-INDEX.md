# GAPS AND ROUTES INDEX

> This document is documentation-grounded. It does not claim a full static code audit.

**After each release:** Reconcile this file with **[`docs/PLATFORM-GAPS.md`](PLATFORM-GAPS.md)** (the **canonical** gap inventory). Update route examples and pointers below when behavior or URLs change; bump the **Last reviewed** date in `PLATFORM-GAPS.md` when you complete that pass.

**Last reconciled with PLATFORM-GAPS.md:** 2026-03-29 (payment lookup tests + index deploy notes + Vitest config include path for `src/**/*.test.js`).

---

## Purpose

Top-level index for **routes**, **implicit web surfaces**, and **where to look next** — not a duplicate of the full gap list.

Use this document to:

- find routes and wrappers quickly
- avoid overcounting implicit web surfaces as separate products
- jump to deeper docs

For **what is missing / partial / stubbed on the platform**, use **`docs/PLATFORM-GAPS.md`** only.

---

## How to read status labels

(Same vocabulary as `PLATFORM-GAPS.md`.)

- **Implemented** · **Implemented with caveat** · **Partial** · **Stubbed** · **Env-gated** · **Missing** · **Deferred / by design**

---

## Gap summary (pointer only)

**→ Full inventory:** [`docs/PLATFORM-GAPS.md`](PLATFORM-GAPS.md)  

Includes: auth, payments, notifications, live, economy, fraud, infra, observability, mobile, discovery, admin, web, support — plus **Still explicitly missing** and **Recently narrowed**.

---

## Implicit and easily misread web surfaces

Route names do not always imply distinct products.

### Redirect-only

Examples:

- `/foryou` -> `/feed`
- `/shop` -> `/feed`
- `/register` -> `/signup`
- `/live/stream/:id` -> `/live/:id`
- `/profile/followers` and `/profile/following` -> creator routes
- `/s/:creatorId` -> `/subscribe/:creatorId`

### Shared UI

Examples:

- `/brand` and `/ads`
- `/coins/success` and `/coins`
- `/checkout/success` and `/checkout`
- `/verify-email/success` and `/verify-email`

### Thin wrappers

Examples:

- `/upload` and `/upload/edit` -> `GoLivePage`
- `/creator/studio` -> `CreatorDashboardPage`
- `/live/:streamId` -> `StreamPlayerPage`
- `/live/moderation` -> `ModeratorPage`
- `/sessions` and `/device-management` -> `SessionsPage`
- `/support/create` -> `SupportFormPage`
- `/support/history` -> `SupportMyTicketsPage`
- `/support/admin` -> `SupportPage`

### Composed modules

Examples:

- `SupportTicketPage` inside `TicketPage` (`/support/:ticketId`)
- `SystemConfigView` inside `Admin`

### Routed product caveats

- `/feed` is not a stable infinite feed surface today — see `PLATFORM-GAPS.md` → Discovery
- AI admin controls are effectively read-only — see `PLATFORM-GAPS.md` → Admin
- Seller onboarding remains partial / provider-dependent — see `PLATFORM-GAPS.md` → Web

---

## Where to go deeper

- Full route map  
  `docs/WEB-ROUTING-INVENTORY.md`  
  `packages/web/src/App.jsx`

- Wrapper / legacy / composed rules  
  `docs/WEB-ROUTE-AUDIT.md`

- **Primary gap inventory (canonical)**  
  `docs/PLATFORM-GAPS.md`

- Missing-core notes (short; defers to platform gaps)  
  `docs/TODO-MISSING-CORE.md`  
  `docs/TODO-PAYMENTS.md`  
  `docs/TODO-LIVE.md`  
  `docs/TODO-DISCOVERY.md`  
  `docs/TODO-COMMERCE.md`  
  `docs/TODO-ADMIN-PRODUCT.md`  
  `docs/TODO-AUTH.md`  
  `docs/TODO-SUPPORT-MODEL.md`  
  `docs/TODO-OBSERVABILITY.md`  
  `docs/TODO-INFRA.md`

- Launch / production readiness  
  `docs/PRODUCTION-CHECKLIST.md`  
  `docs/LAUNCH-BLOCKERS.md`

- Production setup & env  
  `docs/SETUP-PRODUCTION.md`  
  `docs/ENV-SETUP-GUIDE.md`  
  `docs/PROVIDER-STATUS-MATRIX.md`  
  `docs/PRODUCTION-VERIFICATION-STEPS.md`  
  `docs/WINDOWS-WORKSPACE-INSTALL.md`  
  `packages/api/.env.example`  
  `packages/web/.env.example`

---

## Verification note

This index is derived from docs and planning files. It does **not** assert that:

- a full static code audit was performed
- builds/tests are green
- every documented route/state has been re-verified in code
