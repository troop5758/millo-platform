# API Gateway Layer

The API acts as the **single entry point** for all client and server-to-server requests. This doc describes how the gateway responsibilities are implemented in Millo and how they align with common stacks (e.g. NGINX + Node.js or AWS API Gateway).

---

## Responsibilities and implementation

| Responsibility | Implementation | Location / config |
|----------------|----------------|------------------|
| **Authentication** | JWT + session (Bearer), OAuth | Auth: `Authorization: Bearer <token>`. JWT when `JWT_SECRET` set; otherwise session token from DB. OAuth: login/register via Google, Apple, etc. Middleware: `packages/api/src/middleware/auth.middleware.js` (resolve user, optional block suspended/banned). Routes: `packages/api/src/routes/auth.js`. |
| **Rate limiting** | Global + per-route | Global: `@fastify/rate-limit` with config from `@millo/security` (`RATE_LIMIT_MAX`, `RATE_LIMIT_TIME_WINDOW_MS`). Optional Redis store when `RATE_LIMIT_USE_REDIS=true` or `REDIS_HOST`/`REDIS_URL` set (`packages/api/src/lib/rateLimitRedisStore.js`). Per-route overrides: e.g. payments, bids, gifts, reports use stricter limits via route `config: { rateLimit: { max, timeWindow, errorResponseBuilder } }`. |
| **Request routing** | Fastify app, route modules | Single Node.js process; `packages/api/src/app.js` builds Fastify; `packages/api/src/index.js` registers all route modules (auth, live, shop, payments, content, etc.). No path-based routing to different backends; all routes live in the same app. |
| **Geo-based routing** | Region resolution (not traffic geo-routing) | **Region resolver** attaches `request.region` (user_country, user_currency, user_compliance_zone, vat_rate, etc.) for paths under `/payments`, `/content`, `/shop`, `/pricing`, `/ads`, etc. Uses: IP/proxy headers (e.g. `CF-IPCountry`), user profile, or body/query country. `packages/api/src/middleware/regionResolver.js`, `packages/api/src/services/regionDetection.js`. Used for pricing, checkout, compliance — not for directing traffic to different regions (that would be CDN/LB). |
| **Logging** | Request + app logging | Fastify `logger: true` (Pino). Every request has `request.log`. `X-Request-Id` set on each request for tracing. Optional Sentry when `SENTRY_DSN` set (errors, 5% traces); auth/cookie headers stripped in beforeSend. |

---

## Stack: Node.js gateway (current)

- **Runtime:** Node.js.
- **Server:** Fastify (`packages/api/src/app.js`, `index.js`).
- **Auth:** In-process (JWT verify, session lookup in MongoDB).
- **Rate limit:** In-process with optional Redis store for multi-instance consistency.
- **Region:** In-process middleware (no external geo service required; Cloudflare/proxy headers supported).

This fits the **“NGINX + Node.js Gateway”** pattern: NGINX (or another reverse proxy) in front can handle TLS, static assets, and optional extra rate limiting; Node.js is the application gateway that does auth, rate limit, region, and routing.

---

## Using an external API gateway (e.g. AWS API Gateway)

If you put **AWS API Gateway** (or similar) in front:

- **Authentication:** Can keep JWT/session validation in the Node app (Gateway forwards `Authorization`), or move JWT validation to a Lambda authorizer / API Gateway authorizer and pass a validated user id in headers; Node would then trust that header only when the request comes from the gateway.
- **Rate limiting:** API Gateway can provide usage plans and per-key limits; the Node app’s `@fastify/rate-limit` still protects the backend and can stay as-is (or be relaxed if Gateway is the primary limiter).
- **Request routing:** Gateway routes (e.g. by path or stage) to the same Node API URL, or to different Lambdas; Node remains the single backend for “Millo API” in the current design.
- **Geo:** Can use Gateway request context / headers (e.g. `CloudFront-Viewer-Country`) if available; Node’s region resolver can read the same from headers.
- **Logging:** Gateway access logs + Node request logs (`X-Request-Id` and Pino) give end-to-end visibility.

---

## Security and headers

- **CORS:** `@fastify/cors` with `CORS_ORIGIN` (default `https://milloapp.com`); credentials allowed; methods and headers whitelisted.
- **Helmet:** Security headers (X-Content-Type-Options, X-Frame-Options, etc.); CSP and HSTS set via `@millo/security` in an `onSend` hook.
- **Content-Type:** Pre-handler enforces `application/json` on POST/PUT/PATCH except webhooks and multipart.

---

## Summary

| Layer | Technology |
|-------|------------|
| Entry point | Single Fastify app (Node.js) |
| Authentication | JWT (optional) + session (Bearer), OAuth |
| Rate limiting | Global + per-route, optional Redis |
| Request routing | Fastify route registration |
| Geo/region | Region resolver middleware (user country/currency/compliance) |
| Logging | Fastify (Pino) + X-Request-Id + optional Sentry |

For production at **https://milloapp.com**, the API is typically behind a reverse proxy (e.g. NGINX) or an external gateway (e.g. AWS API Gateway); the Node.js app implements the gateway responsibilities above as the single application entry point.
