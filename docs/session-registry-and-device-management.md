# Session Registry & Device Management

Gap remediation: multi-device session tracking, session list/revoke APIs, device fingerprint, login alerts, and suspicious login detection. https://milloapp.com

## Session schema (Session collection)

The existing **Session** model is the session registry. Fields include:

| Field | Type | Description |
|-------|------|-------------|
| userId | ObjectId | Owner |
| token | String | Opaque session token (unique) |
| tokenHash | String | Optional hash for token lookup |
| refreshTokenHash | String | Optional; for future refresh-token flow |
| expiresAt | Date | Session expiry |
| deviceId | String | Device fingerprint (from client) |
| deviceName | String | Human-readable device (e.g. "Chrome on Windows") |
| ip / ipAddress | String | Client IP at login |
| userAgent | String | User-Agent at login |
| location | String | Geo-derived "City, Country" |
| lastSeen / lastActiveAt | Date | Last activity (set at login; optional update on use) |
| revoked / revokedAt | Boolean / Date | Revocation |
| meta | Mixed | e.g. deviceType: ios \| android \| web |

**Location:** `packages/database/src/schemas/Session.js`

## Login flow

On **email/password login** (`POST /auth/login`):

1. Credentials and CAPTCHA (if required) are validated.
2. ATO (account takeover) and geo are run; login is recorded in **LoginAudit**.
3. **Session** is created with:
   - `deviceName` = derived from User-Agent and optional `deviceType` (see `sessionRegistry.deriveDeviceName`).
   - `location` = from geo lookup (e.g. "Berlin, DE").
   - `ip`, `ipAddress`, `userAgent`, `deviceId`, `lastSeen`, `lastActiveAt`, `meta`.
4. If **LOGIN_ALERT_EMAIL_ENABLED** is true and this is a **new device or new location**, a “New sign-in to your account” email is sent (see Login alerts).
5. Bot detection job is enqueued; response returns token and user.

**Helpers:** `packages/api/src/lib/sessionRegistry.js` — `deriveDeviceName(userAgent, deviceType)`, `buildLocationString(geo)`.

## APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/account/sessions` | Bearer | List all sessions for the current user. Returns id, createdAt, expiresAt, deviceId, deviceName, ip, ipAddress, userAgent, location, lastSeen, lastActiveAt, revoked, revokedAt, deviceType, isCurrent, expired. |
| DELETE | `/account/sessions/:sessionId` | Bearer | Revoke one session by id. 404 if not found; 403 if not owned. |
| DELETE | `/account/sessions` | Bearer | Revoke **all other** sessions (keeps the current session). Returns `{ ok: true, revokedCount }`. |

Existing aliases:

- `GET /auth/sessions` — same as `GET /account/sessions`.
- `POST /auth/sessions/:sessionId/invalidate` — revoke one session.

## Security enhancements

### Device fingerprint

- **Client** sends `deviceId` or `fingerprint` in login body; stored in **Session.deviceId** and used for ATO and login alerts.
- Optional: use FingerprintJS and `POST /security/device` (see device-fingerprinting.md) in addition to login.

### Login alerts

- **Service:** `packages/api/src/services/loginAlertService.js`.
- **Trigger:** After successful login, if `LOGIN_ALERT_EMAIL_ENABLED=true` and either:
  - **New device:** this is the first (or only) session with this `deviceId` for this user, or
  - **New location:** this is the first (or only) login from this `country` (LoginAudit) for this user.
- **Action:** Sends email via `@millo/notifications` (SendGrid/SMTP) with subject like “New sign-in to your {App} account” and body with device, location, IP and a note to revoke sessions if it wasn’t them.
- **Config:** `LOGIN_ALERT_EMAIL_ENABLED=true` in `.env`.

### Suspicious login detection

- **Account takeover (ATO):** `accountTakeoverService.recordLoginAndCheckATO` runs on login; uses **LoginAudit** and geo to detect impossible travel and sets **risk lock** (step-up verification) when needed.
- **LoginAudit** stores each login (IP, country, city, lat/lon, deviceFingerprint, userAgent).
- No separate “auth_sessions” collection: **Session** is the registry; **LoginAudit** is the login history for ATO and alerts.

## Configuration

| Env | Description |
|-----|-------------|
| LOGIN_ALERT_EMAIL_ENABLED | Set to `true` to send “new sign-in” emails on new device/location. |
| GEOIP_DB_PATH | Path to MaxMind GeoLite2-City.mmdb for geo (used for location and ATO). |
| ATO_IMPOSSIBLE_TRAVEL_KM | Distance (km) threshold for impossible travel (default 5000). |
| ATO_IMPOSSIBLE_TRAVEL_HOURS | Time (hours) window for impossible travel (default 1). |

## References

- Auth routes: `packages/api/src/routes/auth.js`
- Session schema: `packages/database/src/schemas/Session.js`
- Login alerts: `packages/api/src/services/loginAlertService.js`
- ATO: `packages/api/src/services/accountTakeoverService.js`
- Device fingerprinting: `docs/device-fingerprinting.md`
- Platform gaps: `docs/PLATFORM-GAPS.md` (Auth / multi-device addressed)
