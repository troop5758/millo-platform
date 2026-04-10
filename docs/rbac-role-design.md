# Role design (strict RBAC)

Millo enforces RBAC with the following roles and User fields. Only **admin** can create **support** accounts (and set `createdBy`).

---

## Roles

| Role       | Description |
|-----------|-------------|
| **user**  | Default. Can browse, follow, gift, purchase; cannot access staff dashboards. |
| **creator** | Can go live, run storefront, receive gifts/payouts (when approved). Elevated for creator-only routes. |
| **mod**    | Moderator. Can access mod dashboards (abuse queue, appeals, live moderation). |
| **support** | Staff. Restricted: can view/respond to tickets, payment lookup, user tools. Gated by `hasRole(user, 'support')` or `hasRole(user, 'admin')`. Only admin can create support accounts. |
| **admin**  | Full access. Only role that can create support users and perform admin-only actions (users CRUD, kill switch, financial ops, discovery models, etc.). |

Hierarchy (from `@millo/dashboards` roles):

- **admin** → can do everything (admin, mod, support, creator scopes).
- **mod** → admin + mod.
- **support** → admin + mod + support.
- **creator** → admin + creator (creator-specific admin).
- **user** → base.

---

## User model (MongoDB)

Millo’s **User** schema already includes your RBAC fields:

| Your field        | Millo field   | Notes |
|-------------------|---------------|--------|
| `email`           | `email`       | Required, unique. |
| `password`        | —             | Not on User; auth uses Session + hashed token or external IdP. Passwords, when used, are in auth flow (e.g. bcrypt elsewhere). |
| `role`            | `role`        | Enum: `user`, `creator`, `mod`, `support`, `admin`. Default `user`. |
| `isActive`        | `status`      | Enum: `active`, `suspended`, `banned`, `pending_verification`. Default `active`. Use `status === 'active'` for “isActive”. |
| `createdBy`       | `createdBy`   | ObjectId ref User. Set when admin creates a support account. |
| `permissions`     | `permissions` | Optional staff permissions (support role): `canModerate`, `canViewTickets`, `canRespondTickets`. When absent, support has full ticket access. |

Additional fields on User (no schema change needed for your list): `emailVerified`, `phoneVerified`, `creatorStatus`, `suspensionReason`, `shadowBanned`, `riskLock`, `flags`, `pushTokens`, timestamps.

---

## Enforcement

- **Dashboards / support**: `getRequestUser(req)` then `dashboards.hasRole(user, 'support')` or `hasRole(user, 'admin')` for ticket/refund/lookup; `user.role === 'admin'` for admin-only routes (create user, kill switch, etc.).
- **Creating support**: Admin-only user creation (e.g. `POST /admin/users` or equivalent) sets `role: 'support'` and `createdBy: admin._id`. Support accounts are “restricted staff” and must be created by admin only.
- **MySQL hybrid**: Schema is MongoDB; if you mirror to MySQL, keep `role` enum and `status` enum consistent so RBAC checks work the same.

---

## Summary

- **Roles**: user, creator, mod, support, admin (strict enum on User).
- **Support**: restricted staff; only admin can create support accounts; `createdBy` tracks creator.
- **Permissions**: optional `permissions` on User for support (canModerate, canViewTickets, canRespondTickets).
- **Active flag**: use `status === 'active'` instead of a separate `isActive` boolean.
