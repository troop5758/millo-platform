# Rate Limiting

API endpoints are protected with per-route rate limits (via `@fastify/rate-limit`). Limits are applied per client (IP by default).

## Endpoint limits (per minute unless noted)

| Action | Limit | Route |
|--------|--------|--------|
| **Likes** | 60/min | `POST /content/streams/:streamId/like`, `DELETE /content/streams/:streamId/like` |
| **Comments** | 30/min | `POST /content/streams/:streamId/comments` |
| **Follows** | 20/min | `POST /profile/follow/:userId`, `DELETE /profile/follow/:userId` |
| **DM** | 10/min | `POST /dm/messages` |

Other routes (auth, payments, gifts, reports, etc.) have their own per-route limits defined in the respective route files.

## Implementation

- **Global default:** `@fastify/rate-limit` is registered in `packages/api/src/app.js` using `security.getRateLimitConfig()` (`RATE_LIMIT_MAX`, `RATE_LIMIT_TIME_WINDOW_MS`).
- **Per-route override:** Routes pass `config: { rateLimit: { max, timeWindow, errorResponseBuilder } }` to enforce stricter limits (e.g. likes 60/min, comments 30/min, follows 20/min, DM 10/min).
- When exceeded, the API returns **429** with `error: 'RATE_LIMITED'` and the message from `errorResponseBuilder`.

## Optional: rate-limiter-flexible

For Redis-backed or per-user limits (e.g. in a multi-instance deployment), you can add `rate-limiter-flexible`:

```js
const { RateLimiterMemory } = require('rate-limiter-flexible');

const limiter = new RateLimiterMemory({
  points: 60,
  duration: 60,
});
// Then consume/check per key (e.g. userId or IP) before handling the request.
```

Millo currently uses Fastify’s built-in rate-limit (in-memory per process). For a shared Redis store, consider `@fastify/rate-limit` with a custom `redis` store or a custom middleware using `rate-limiter-flexible` with `RateLimiterRedis`.

## References

- `packages/api/src/app.js` — global rate-limit registration
- `packages/security/src/rateLimit.js` — default config
- `packages/api/src/routes/content.js` — likes, comments limits
- `packages/api/src/routes/profile.js` — follows limit
- `packages/api/src/routes/dm.js` — DM limit
