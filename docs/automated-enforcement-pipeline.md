# Automated Enforcement Pipeline (Bot Detection Queue)

The enforcement pipeline uses a **BullMQ** queue (`bot-detection`) to run risk score updates and apply automated actions: CAPTCHA challenge, shadow ban, and permanent ban.

## Queue: BotDetectionQueue

- **Name:** `bot-detection`
- **Library:** BullMQ
- **Connection:** Same Redis as other queues (`REDIS_HOST`, `REDIS_PORT`)

## Job types

| Job type              | Description                                                                 | Follow-up jobs (by score)      |
|-----------------------|-----------------------------------------------------------------------------|---------------------------------|
| `risk_score_update`   | Recompute user risk; may enqueue captcha / shadow_ban / permanent_ban      | See thresholds below            |
| `captcha_challenge`   | Set Redis key so next login/gift requires CAPTCHA for this user            | —                               |
| `shadow_ban`         | Set user as shadow-banned (Moderation + User + Profile)                    | —                               |
| `permanent_ban`      | Set user status to `banned`, suspensionReason, flags.suspended            | —                               |

## Thresholds (env)

- `BOT_ENFORCE_CAPTCHA_THRESHOLD` (default 70): score ≥ this → enqueue `captcha_challenge`
- `BOT_ENFORCE_SHADOW_BAN_THRESHOLD` (default 80): score ≥ this → enqueue `shadow_ban`
- `BOT_ENFORCE_PERMANENT_BAN_THRESHOLD` (default 95): score ≥ this → enqueue `permanent_ban`
- `BOT_REQUIRE_CAPTCHA_TTL_SEC` (default 86400): TTL for `require_captcha:{userId}` Redis key (24h)

## Flow

1. **Enqueue**  
   - On login: `addBotDetectionJob('risk_score_update', { userId })` (fire-and-forget).  
   - Admin or other flows can enqueue any job type via `addBotDetectionJob(type, data)`.

2. **Worker**  
   - `botDetectionWorker` consumes `bot-detection`.  
   - `risk_score_update`: calls `riskEngine.calculateRisk(userId)`; if score ≥ thresholds, enqueues `captcha_challenge`, `shadow_ban`, or `permanent_ban`.  
   - `captcha_challenge`: sets Redis key `require_captcha:{userId}` (read by auth and gift routes).  
   - `shadow_ban`: updates Moderation, Profile, User (shadowBanned); logs to AdminAuditLog with `adminId: null` (system).  
   - `permanent_ban`: sets User `status: 'banned'`, suspensionReason, flags.suspended; logs to AdminAuditLog.

3. **CAPTCHA at request time**  
   - Auth login and gift send check `requireCaptcha(riskScore) || await requireCaptchaForUser(userId)`.  
   - `requireCaptchaForUser` reads the Redis key set by the worker.

## Code references

- **Queue:** `packages/api/src/lib/botDetectionQueue.js` — `getBotDetectionQueue()`, `addBotDetectionJob(jobType, data, opts)`
- **Worker:** `packages/api/src/workers/botDetectionWorker.js` — `start(log)`, `stop()`
- **Require CAPTCHA Redis:** `packages/api/src/lib/requireCaptchaRedis.js` — `setRequireCaptcha(userId, ttlSec)`, `isRequireCaptcha(userId)`
- **Bootstrap:** `packages/api/src/index.js` — worker started after other workers; shutdown calls `botDetectionWorker.stop()`
- **Metrics:** `bot-detection` included in Prometheus queue depth (see `packages/api/src/routes/metrics.js`)

## Security dashboard

Admin can view enforcement-related data via the Security Dashboard API (suspicious accounts, bot clusters, device fingerprints, risk scores, live alerts). See `docs/security-dashboard.md` or `GET /admin/security/dashboard`.
