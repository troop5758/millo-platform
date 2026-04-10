# WEB ROUTING INVENTORY

## Purpose

This document is the contributor-facing route map for `packages/web`.

`packages/web/src/App.jsx` remains the runtime source of truth.

**Warning:**  
Route names do not always imply distinct products. Some URLs are redirect-only, some share the same UI, and some are thin wrapper pages over another screen.

---

## Canonical routes

| Canonical Route | Notes |
|---|---|
| `/feed` | Canonical discovery route |
| `/signup` | Canonical signup route |
| `/creator/me/followers` | Canonical “my followers” route |
| `/creator/me/following` | Canonical “my following” route |
| `/live/:streamId` | Canonical livestream player route |
| `/subscribe/:creatorId` | Canonical subscribe route |
| `/coins` | Canonical coin store route |
| `/checkout` | Canonical checkout route |
| `/verify-email` | Canonical verification route |

---

## Redirect-only routes

| Redirect Route | Resolves To |
|---|---|
| `/foryou` | `/feed` |
| `/shop` | `/feed` |
| `/register` | `/signup` |
| `/profile/followers` | `/creator/me/followers` |
| `/profile/following` | `/creator/me/following` |
| `/live/stream/:streamId` | `/live/:streamId` |
| `/s/:creatorId` | `/subscribe/:creatorId` |

---

## Shared-UI routes

| Route | Same UI As | Shared Component |
|---|---|---|
| `/coins/success` | `/coins` | `CoinStorePage` |
| `/checkout/success` | `/checkout` | `CheckoutPage` |
| `/verify-email/success` | `/verify-email` | `VerifyEmailPage` |
| `/brand` | `/ads` | `BrandDashboardPage` |
| `/ads` | `/brand` | `BrandDashboardPage` |

---

## Thin wrapper routes

| Route | Wrapper Module | Actually Shows |
|---|---|---|
| `/upload` | `UploadPage` | `GoLivePage` |
| `/upload/edit` | `UploadPage` | `GoLivePage` |
| `/creator/studio` | `CreatorStudio` | `CreatorDashboardPage` |
| `/live/:streamId` | `LiveStreamPage` | `StreamPlayerPage` |
| `/live/moderation` | `LiveModerationAliasPage` | `ModeratorPage` |
| `/sessions` | `SessionsAliasPage` | `SessionsPage` |
| `/device-management` | `DeviceManagementPage` | `SessionsPage` |
| `/support/create` | `SupportCreatePage` | `SupportFormPage` |
| `/support/history` | `SupportHistoryPage` | `SupportMyTicketsPage` |
| `/support/admin` | `SupportAdminPage` | `SupportPage` |

---

## Internally composed modules

| Module | Used By |
|---|---|
| `SupportTicketPage` | `TicketPage` (`/support/:ticketId`) |
| `SystemConfigView` | `AdminPage` |

---

## Param-driven reused pages

| Routes | Component | Notes |
|---|---|---|
| `/creator/:id/followers` and `/creator/:id/following` | `FollowersFollowingPage` | Shared component; mode comes from route |

---

## Product caveats for routed surfaces

### `/feed`

Current paging is not stable infinite feed behavior.

### AI controls

Admin AI controls are effectively read-only unless and until real persistence exists.

### Seller onboarding

Seller onboarding is provider-dependent and partial.

---

## Maintenance rules

1. `App.jsx` is the runtime source of truth.
2. Redirect-only routes should remain redirect-only.
3. Shared-UI routes should document the shared component.
4. Thin wrapper pages should stay logic-light.
5. Composed modules should not be mistaken for route roots.
6. Route names should not be used as proof of product completeness.
