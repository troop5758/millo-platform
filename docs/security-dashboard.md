# Security Dashboard (Admin)

Admins can view security and bot-detection data through a single dashboard API and existing per-entity endpoints.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboards/admin/security/dashboard` | Full security dashboard payload (admin only) |
| GET | `/admin/security/dashboard` | Same as above (alias) |
| GET | `/admin/risk/:userId` | Bot risk score and signals for one user |
| GET | `/admin/bot-cluster/:userId` | Bot cluster detection result for one user |
| GET | `/admin/streams/:streamId/bot-check` | Live stream bot detection result for one stream |

## Dashboard response shape

`GET /admin/security/dashboard` returns:

- **suspiciousAccounts** — Users that appeared in `FraudEvent` with action `review` or `block` in the last 7 days. Each item: `{ userId, lastEventAt, action }` (limit 50).
- **botClusters** — Device fingerprints shared by more than one user (potential bot clusters). Each item: `{ fingerprint, userCount, deviceCount }` (limit 30).
- **deviceFingerprints** — Summary: `{ totalFingerprints, fingerprintsSharedByMultipleUsers }`.
- **riskScores** — Risk score and signals for the suspicious-account user IDs (batch of 20). Each item: `{ userId, score, signals }`.
- **liveAlerts** — Recent alerts (last 24h): `FraudEvent` with action `review`/`block` or refType `stream` (viewer_spike). Each item: `{ id, userId, eventType, action, refType, refId, createdAt, meta }` (limit 50).

## What admins can view

- **Suspicious accounts** — List and drill down via `/admin/risk/:userId` and `/admin/bot-cluster/:userId`.
- **Bot clusters** — Fingerprints used by multiple accounts; use risk and bot-cluster APIs per userId for details.
- **Device fingerprints** — Aggregate counts; per-user fingerprint data can be added later if needed.
- **Risk scores** — In-dashboard batch for suspicious users; any user via `/admin/risk/:userId`.
- **Live alerts** — Recent fraud and live-stream bot events in one list.

## Service

- **Implementation:** `packages/api/src/services/securityDashboardService.js`
- **Exports:** `getSecurityDashboard(opts)`, `getSuspiciousAccountIds`, `getBotClusterFingerprints`, `getDeviceFingerprintSummary`, `getRiskScoresForUsers`, `getLiveAlerts`

All dashboard endpoints require admin role; use the same auth as other admin routes (Bearer token or, in non-production, `X-User-Id` / `X-User-Role`).
