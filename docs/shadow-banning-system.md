# Shadow Banning System

Instead of banning immediately, the platform reduces visibility for shadow-banned users. Their content and activity remain on the platform but are heavily down-ranked or hidden.

## Effects for shadow-banned users

- **Videos never reach FYP** — ranking score is multiplied by 0.05 so they rarely appear in For You.
- **Comments hidden** — comments from shadow-banned users are excluded from public comment lists.
- **Live visibility reduced** — same ranking penalty in discovery; streams appear at the bottom or not at all.
- **Gifts / revenue** — existing logic blocks payouts and can hide gift activity for shadow-banned creators.

## Moderation schema

**`Moderation`** (per-user, upsert by `userId`):

- `userId` — User reference (unique)
- `shadowBanned` — boolean
- `reason` — optional text
- `expiresAt` — optional; when set, shadow ban is ignored after this time
- `setAt`, `setBy` — audit

When setting a shadow ban, the app writes to **Moderation** and syncs **User.shadowBanned** and **Profile.shadowBanned** for fast checks.

## Feed ranking

**`packages/discovery/src/rankingEngine.js`**

- `rankDiscovery()` multiplies the discovery score by **0.05** for items where `item.shadowBanned` is true (configurable via `SHADOW_BAN_RANK_MULTIPLIER`).
- Shadow-banned content is not removed from the index; it is down-ranked so it effectively never reaches FYP.

## Comments

**GET /content/streams/:streamId/comments** — comment authors are checked with `moderationService.isShadowBanned(userId)`; comments from shadow-banned users are omitted from the response.

## API

- **POST /dashboards/mod/shadow-ban** — Body: `{ userId, shadowBanned, reason?, expiresAt? }`. Writes Moderation and syncs User/Profile. Mod-only.

## References

- [anti-bot-system-architecture.md](anti-bot-system-architecture.md) — Action Layer (Shadow ban)
- `packages/database/src/schemas/Moderation.js`
- `packages/api/src/services/moderationService.js` — `isShadowBanned()`
- `packages/dashboards/src/moderator.js` — `setShadowBan()`
- `packages/discovery/src/rankingEngine.js` — feed ranking multiplier
