# Phase 12 — Smart TV

**Owns:** Apple TV app, Android TV app, Read-only mode, Device pairing.  
**Depends on:** Phase 4, Phase 6.

---

## Scope

- **Apple TV** and **Android TV** — same API; platform (`apple_tv` | `android_tv`) set at pairing.
- **Read-only mode** — TV clients (header `X-Client: tv`) may only GET allowed paths and POST `/tv/pairing/link`; no economy, billing, or dashboard writes (Phase 6 commerce blocked).
- **Device pairing** — TV must complete pairing (code + deviceId + platform) before using read-only endpoints. Uses Phase 4 (live) for streams; Phase 6 not used for purchases on TV.
- **Validation:** Read-only enforced; TV POST to economy/dashboards returns 403 TV_READ_ONLY.

## Device pairing

1. User creates a pairing code in the web/app: `POST /tv/pairing/code` (authenticated). Response: `{ code, expiresAt }` (code valid 10 minutes).
2. User enters the code on the TV. TV calls `POST /tv/pairing/link` with `{ code, deviceId, platform }` where `platform` is `apple_tv` or `android_tv`.
3. Server links the device to the user and returns `{ userId, deviceId, platform, paired: true }`. TV then uses read-only endpoints with `X-Client: tv` and (when implemented) a session token for the paired user.

## Read-only enforcement

- Requests with header **`X-Client: tv`** are treated as TV clients.
- **Allowed:** `GET` to paths under `/tv/`, `/health`, `/live/`, `/discovery/`, and `POST` to `/tv/pairing/link` only.
- **Blocked:** Any other method or path (e.g. `POST /economy/gift`, `POST /dashboards/admin/*`, `POST /live/start`) → **403 TV_READ_ONLY**.

Enforcement is applied in the API `onRequest` hook so all routes are protected.

## Schemas (Phase 12)

- **TVPairingCode** — `code`, `userId`, `expiresAt`, `usedAt`. One-time use; 10-minute TTL.
- **TVDevice** — `userId`, `deviceId`, `platform` (apple_tv | android_tv), `lastSeenAt`, `meta`. Unique `deviceId`.

## API (TV)

| Method | Path | Description |
|--------|------|-------------|
| POST | /tv/pairing/code | Create pairing code (web/app; auth) |
| POST | /tv/pairing/link | Link device with code (TV; no auth) |
| GET | /tv/channels | List active channels (read-only) |
| GET | /tv/channels/:channelId/schedule | Schedule for channel (read-only) |
| GET | /tv/streams | List live streams (read-only) |
| GET | /tv/devices | List paired devices (auth) |

## Package

- **@millo/tv** — `createPairingCode`, `pairDevice`, `isPaired`, `getPairedDevices`, `enforceReadOnly`, `isTvClient`, `isAllowedPath`, `isReadOnlyRequest`.

## Validation

- `npm run validate:phase12` — runs read-only tests: TV client detection, allowed paths, and enforcement (GET allowed, POST to economy/dashboards blocked).

## Domain

All behaviour bound to https://milloapp.com.
