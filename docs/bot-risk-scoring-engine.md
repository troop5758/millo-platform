# Bot Risk Scoring Engine

Every user gets a **risk score** (0–100) based on activity signals. Used for anti-bot detection and review/block decisions.

## Signals and scores

| Signal | Threshold / condition | Score |
|--------|------------------------|-------|
| High likes per minute | ≥ 100 likes in last minute | +40 |
| Same device many accounts | ≥ 100 accounts share same fingerprint | +50 |
| Identical comments | User repeated same comment text | +30 |
| No mouse movement | ≥ 10 actions (video_watch, like, etc.) in 1h, 0 scroll/mousemove | +20 |
| New account mass follows | Account &lt; 7 days old and ≥ 50 follows in 24h | +30 |

Final score is capped at 100. Downstream logic can treat e.g. score ≥ 50 as review, ≥ 80 as block.

## Service

**`packages/api/src/services/riskEngine.js`**

- **`calculateRisk(userId)`** → `{ score, signals }` — main API.
- Helpers (for tests or custom logic): `getLikesPerMinute`, `detectDuplicateComments`, `getDeviceReuseAccountCount`, `detectNoMouseMovement`, `detectNewAccountMassFollows`.

## Config (env)

- `RISK_LIKES_PER_MIN_THRESHOLD` — default 100
- `RISK_SAME_DEVICE_ACCOUNTS_THRESHOLD` — default 100
- `RISK_NEW_ACCOUNT_DAYS` — default 7
- `RISK_MASS_FOLLOW_THRESHOLD` — default 50

## API (admin)

- **GET /dashboards/admin/risk/:userId** — returns `{ userId, score, signals }`. Admin only.
- **GET /admin/risk/:userId** — same, admin only.

## References

- [anti-bot-system-architecture.md](anti-bot-system-architecture.md) — Detection Layer (Risk scoring)
- [bot-types-and-detection.md](bot-types-and-detection.md) — Bot types and signals
- `packages/api/src/services/riskEngine.js`
- `packages/api/src/routes/dashboards.js` — admin risk routes
