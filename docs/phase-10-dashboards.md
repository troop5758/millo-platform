# Phase 10 — Dashboards

**Owns:** Admin dashboard, Moderator dashboard, Support dashboard, Financial viewer, Kill-switch UI, Abuse review, Appeals UI.  
**Depends on:** Phase 3, Phase 6, Phase 9.

---

## Scope

- **Admin:** Financial ops, kill-switch UI, ledger view, financial viewer, economy control.
- **Moderator:** Live moderation, abuse queue, abuse review (dismiss / apply penalty via Phase 3), appeals UI.
- **Support:** Tickets, refund handling, user account tools.
- **Validation:** RBAC enforced; every override logged to `AdminAuditLog`.

## RBAC

- **admin** — full access to admin, mod, and support actions.
- **mod** — live moderation, abuse queue, appeals.
- **support** — tickets, refund handling, user account tools.

Roles are enforced in `@millo/dashboards` via `requireAdmin`, `requireMod`, `requireSupport`. API returns `403 FORBIDDEN` when the caller's role is insufficient.

## Admin dashboard

| Capability       | Description |
|------------------|-------------|
| Financial ops    | Credit/debit user wallet (admin override); logged to `AdminAuditLog` and economy/ledger (Phase 6). |
| Kill-switch UI   | Set `ADS_ENABLED`, `MILLA_ENABLED`, `LIVE_FILTERS_ENABLED`; each change logged. |
| Ledger view      | Read ledger entries for a user (actorId). |
| Financial viewer | **getFinancialView(adminUser, userId)** — balance, recent LedgerEntry, recent FinancialAuditLog (Phase 6 + Phase 9). Read-only. |
| Economy control  | Get balance or run financial ops (credit/debit). |

## Moderator dashboard

| Capability       | Description |
|------------------|-------------|
| Live moderation  | Call live `moderateStream`; action logged to `AdminAuditLog`. |
| Abuse queue      | List `Report` documents (filter by status). |
| Abuse review     | **abuseReview(modUser, reportId, action, meta)** — action `dismiss` or `apply_penalty`. If `apply_penalty` and report targetType is User, calls Phase 3 `applyAbusePenalty(targetId, reason)`. Report status updated; AdminAuditLog. |
| Appeals UI       | List `Appeal` documents; resolve with decision `upheld` or `overturned`; logged. |

## Support dashboard

| Capability         | Description |
|--------------------|-------------|
| Tickets            | Create and list `Ticket` documents. |
| Refund handling    | Record refund request; logged to `AdminAuditLog`. |
| User account tools | Get user by id; set user flag (e.g. lock) with override reason; logged. |

## Schemas (Phase 10)

- **Ticket** — `userId`, `subject`, `status` (open, in_progress, resolved, closed), `assignedTo`, `meta`.
- **Appeal** — `reportId`, `userId`, `reason`, `status` (pending, upheld, overturned), `decidedBy`, `decidedAt`, `meta`.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /dashboards/admin/financial-view/:userId | Financial viewer (balance, ledger, financial audit logs). Query: ledgerLimit, auditLimit. |
| POST | /dashboards/admin/kill-switch | Body: which (ads\|milla\|filters), enabled. |
| POST | /dashboards/mod/abuse-review | Body: reportId, action (dismiss\|apply_penalty), meta.reason. |

Other routes: `/dashboards/admin/financial-ops`, `/dashboards/admin/ledger/:userId`, `/dashboards/admin/economy`; `/dashboards/mod/live-moderation`, `/dashboards/mod/abuse-queue`, `/dashboards/mod/appeals`, `/dashboards/mod/appeals/:appealId/resolve`; `/dashboards/support/tickets`, `/dashboards/support/refund`, `/dashboards/support/user-tools`. Caller identity from `req.user` or headers `X-User-Id`, `X-User-Role`.

## Validation

- `npm run validate:phase10` — runs RBAC unit tests and asserts that admin, moderator, and support modules call `AdminAuditLog.create` for override actions.

## Domain

All behaviour bound to https://milloapp.com.
