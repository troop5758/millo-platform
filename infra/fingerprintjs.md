# FingerprintJS (Device Fingerprinting)

Client-side device fingerprinting for Millo. The backend accepts a **visitorId** (and optional metadata) and uses it for fraud and bot detection (multi-account, graph clusters, risk scoring). All behaviour bound to **https://milloapp.com**.

---

## Overview

- **FingerprintJS** (open-source) or **Fingerprint Pro** (hosted, higher stability): generates a stable `visitorId` per device/browser.
- **Backend:** `POST /security/device` records the fingerprint with the current user: `visitorId`, IP, userAgent, timezone, screen (see `fraudService.recordDevice()`). Stored in `DeviceFingerprint` and used by the risk engine and graph detection.

---

## Client Setup

1. **Install**
   - Open-source: `@fingerprintjs/fingerprintjs-pro` or `@fingerprintjs/fingerprintjs` (open-source).
   - Pro (recommended for production): use Pro for better accuracy and server-side validation; env: `FINGERPRINTJS_PUBLIC_API_KEY` (or `FINGERPRINT_PUBLIC_API_KEY` for Pro).

2. **Get visitorId**
   - Call the FingerprintJS/Pro API to get `visitorId` (and optionally `requestId`, `confidence`, etc.).

3. **Send to backend**
   - After login/session load, call `POST /security/device` with body:
     - `visitorId` (required) — from FingerprintJS.
     - Optional: `userAgent`, `screen`, `timezone`, and any extra `meta` for analytics.
   - Backend will add `ip` from the request.

---

## Backend

- **Route:** `POST /security/device` (see `packages/api/src/routes/security.js`). Requires auth (session or Bearer).
- **Service:** `fraudService.recordDevice(userId, fingerprint, opts)` — upserts `DeviceFingerprint` with userId, fingerprint (visitorId), IP, userAgent, etc.
- **Usage:** Multi-account detection, bot graph clusters (same device many accounts), risk scoring (e.g. device_reuse). No extra env vars required for basic flow; Pro server API (if used) would need a server-side key in secrets.

---

## Environment (optional)

| Variable | Description |
|----------|-------------|
| `FINGERPRINTJS_PUBLIC_API_KEY` | Fingerprint Pro public API key for client (browser). |
| (Pro server API) | If you use Pro’s server API for validation, store the secret in secrets manager and do not expose it to the client. |

---

## Domain

All behaviour bound to **https://milloapp.com**.
