# Admin AI Shadow Mode Toggle

AI shadow mode is stored in the platform config (MongoDB `PlatformSettings` collection) under the key `ai_shadow_mode`. When enabled, the platform can run AI moderation in "shadow" mode (e.g. log decisions without enforcing, or queue for human review when AI is disabled).

## Config storage

- **Collection**: `PlatformSettings` (key/value store)
- **Key**: `ai_shadow_mode`
- **Value**: `true` | `false` (boolean)

Example document:

```json
{
  "key": "ai_shadow_mode",
  "value": true
}
```

## API

### GET /admin/moderation/shadow-mode

- **Auth**: Admin only.
- **Response**: `{ "ai_shadow_mode": true }` or `{ "ai_shadow_mode": false }`

### PATCH /admin/moderation/shadow-mode

- **Auth**: Admin only.
- **Body**: `{ "enabled": true }` or `{ "value": true }` to enable; omit or `false` to disable.
- **Response**: `{ "ok": true, "ai_shadow_mode": true }`
- **Side effects**: Updates `PlatformSettings`, writes to `AdminAuditLog` with action `ai_shadow_mode_toggle`.

## Legacy / dashboard aliases

- **GET** `/dashboards/admin/ai-shadow-enabled` and **GET** `/admin/ai/shadow-mode` return the same setting (response includes both `ai_shadow_mode` and `ai_shadow_enabled`).
- **POST** `/dashboards/admin/ai-shadow-enabled` and **POST** `/admin/ai/shadow-mode` with body `{ "enabled": true }` update the same `ai_shadow_mode` key.

All of these read/write the single `ai_shadow_mode` value in `PlatformSettings`.
