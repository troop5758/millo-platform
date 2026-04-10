# Device Fingerprinting (TikTok-style)

Identifies devices even when users change accounts or IPs. Used for anti-bot and multi-account detection.

## Signals collected

- **Browser fingerprint** — FingerprintJS `visitorId` (canvas, WebGL, fonts, etc.)
- **User agent** — `navigator.userAgent`
- **Screen size** — `screen.width x screen.height`
- **Timezone** — `Intl.DateTimeFormat().resolvedOptions().timeZone`
- **IP** — Set by backend from request
- **Optional (in meta)** — device memory, hardware concurrency, etc.

## React client

- **Library:** `@fingerprintjs/fingerprintjs`
- **API:** `getDeviceFingerprintPayload()` returns `{ visitorId, userAgent, screen, timezone }` for `POST /security/device`.
- **Legacy:** `getDeviceFingerprint()` returns a stable string (visitorId or fallback hash) for gift/checkout flows that send `fingerprint` to existing endpoints.

After login/register, the client sends the full payload to `POST /security/device`. Other flows (gifts, coin checkout, etc.) continue to send the fingerprint string where required.

## Backend

- **Schema:** `DeviceFingerprint` — `fingerprint` (required), `userId`, `visitorId`, `timezone`, `screenResolution`, `ip`, `userAgent`, `meta`.
- **Endpoints:**
  - `POST /security/device` — Body: `{ visitorId, userAgent?, screen?, timezone?, ... }`. Auth required. Canonical TikTok-style device registration.
  - `POST /fraud/track` — Body: `{ fingerprint }` or `{ visitorId, timezone?, screen?, userAgent?, meta? }`. Auth required. Same storage, backward compatible.
- **Service:** `fraudService.recordDevice(userId, fingerprint, opts)` with `opts`: `ip`, `userAgent`, `timezone`, `screen`/`screenResolution`, `visitorId`, `meta`.

## References

- [anti-bot-system-architecture.md](anti-bot-system-architecture.md) — Client layer
- [phase-11-fraud-prevention.md](phase-11-fraud-prevention.md) — Fraud signals
- `packages/web/src/lib/deviceFingerprint.js` — Client collector
- `packages/api/src/routes/security.js` — `POST /security/device`
- `packages/database/src/schemas/DeviceFingerprint.js` — Schema
