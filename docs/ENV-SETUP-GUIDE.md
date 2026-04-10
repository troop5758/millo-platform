# ENV SETUP GUIDE

Environment variables used by Millo, grouped for setup. **Names match the codebase** where possible; if your branch differs, grep `process.env` in `packages/api` and `import.meta.env` in `packages/web`.

**Align with:** `packages/api/.env.example`, `packages/web/.env.example`, `docs/SETUP-PRODUCTION.md`.

This guide does **not** claim all values are set or that production is ready.

---

## Bootstrap admin (optional)

Used when **no** administrator exists yet (`packages/api/src/bootstrap/initialAdmin.js`).

| Variable | Description |
|----------|-------------|
| `INITIAL_ADMIN_EMAIL` | Admin login email (default in script: `admin@$MILLO_DOMAIN`) |
| `INITIAL_ADMIN_PASSWORD` | Min 8 characters; if unset, `scripts/bootstrap-initial-admin.js` generates a random one |

**Server install:** `scripts/install-ubuntu-22.04.sh` runs `npm run bootstrap:admin` after dependencies install. Prefer **not** storing `INITIAL_ADMIN_PASSWORD` in `.env` long term.

---

## Core

| Variable | Description | Required for public launch? | Fallback / if missing |
|----------|-------------|------------------------------|-------------------------|
| `NODE_ENV` | `development` vs `production` | **yes** (`production` for prod) | Dev defaults; stubs more likely |
| `MONGODB_URI` | Mongo connection string | **yes** (API `validateEnv` critical) | API will not start in prod |
| `REDIS_URL` | Redis connection (or use `REDIS_HOST`/`REDIS_PORT` in some paths) | **yes** (critical in `validateEnv`) | Locks/rate-limit features degraded |
| `JWT_SECRET` | Signing secret for JWTs | **yes**; min **32** chars in production (`productionGuard`) | Auth broken / startup fails |
| `FRONTEND_URL` | Web origin for links/redirects | **yes** for correct URLs | Defaults vary by route |
| `CORS_ORIGIN` | Allowed browser origin | **recommended** | Defaults to `https://milloapp.com` in `app.js` |
| `APP_URL` | Optional app base override | no | Falls back to `FRONTEND_URL` in some routes |
| `PAYMENT_PROVIDER` | e.g. `stripe` | **yes** in production | `productionGuard` rejects `sandbox`/`dev`/`coin` as primary |

---

## Auth (OAuth)

Registry: `packages/api/src/services/oauthProviders.js`. **Use `OAUTH_*` for real OAuth flows.**

| Variable | Description | Required for public launch? | Fallback |
|----------|-------------|------------------------------|----------|
| `OAUTH_GOOGLE_CLIENT_ID` | Google OAuth client ID | **recommended** if Google login shipped | Provider disabled in UI |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth secret | with Google | Provider disabled |
| `OAUTH_FACEBOOK_CLIENT_ID` / `OAUTH_FACEBOOK_CLIENT_SECRET` | Facebook | optional | Disabled if unset |
| `OAUTH_APPLE_CLIENT_ID` | Apple Sign In | optional | Apple disabled if unset |
| `OAUTH_TWITTER_*`, `OAUTH_GITHUB_*` | Other OAuth | optional | Disabled if unset |

**Health snapshot caveat:** `packages/api/src/lib/providerState.js` `getOAuthState()` currently checks **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** for Google — not the `OAUTH_GOOGLE_*` names. For **`GET /health`** OAuth lines to match OAuth reality, set **both** naming schemes **or** align code in a future change. Password/magic-link remain available regardless.

**productionGuard:** requires at least one **enabled** OAuth provider in production.

---

## Payments

| Variable | Description | Required for public launch? | Fallback |
|----------|-------------|------------------------------|----------|
| `STRIPE_SECRET_KEY` | Stripe secret | **yes** if Stripe is live (`validateEnv` critical) | Stub / errors on money routes |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable | **yes** (critical list) | Checkout misconfigured |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | **strongly recommended** | Webhook verification fails (`productionGuard` warns) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal | only if PayPal promised | PayPal path unconfigured |
| `WISE_API_TOKEN` | Wise payouts | only if Wise promised | Wise unconfigured |

---

## Email

| Variable | Description | Required for public launch? | Fallback |
|----------|-------------|------------------------------|----------|
| `EMAIL_PROVIDER` | `sendgrid` \| `aws_ses` \| `resend` \| `smtp` \| `console` | **yes** in prod (`validateEnv` critical) | Must set + provider vars |
| `SENDGRID_API_KEY` | SendGrid | if `EMAIL_PROVIDER=sendgrid` | Transporter fails |
| `SENDGRID_KEY` | Alias read by `emailService.js` | optional alternate | Either works for some paths |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | SMTP | if `EMAIL_PROVIDER=smtp` | — |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_REGION` | SES | if `aws_ses` | — |
| `RESEND_API_KEY` | Resend | if `resend` | — |
| `EMAIL_CONSOLE_DISALLOWED` | `true` to hard-fail console in prod | **recommended** | Console allowed with warning |

---

## Push

| Variable | Description | Required for public launch? | Fallback |
|----------|-------------|------------------------------|----------|
| `FIREBASE_SERVER_KEY` | FCM legacy server key (`push.js`) | only if FCM tokens used | FCM sends no-op |
| `EXPO_ACCESS_TOKEN` | Expo push API | only if Expo tokens used | Expo may still work with reduced auth |

---

## Safety

| Variable | Description | Required for public launch? | Fallback |
|----------|-------------|------------------------------|----------|
| `AI_MODERATION_ENABLED` | `true` to enable moderation path | product decision | Moderation **disabled** |
| `OPENAI_API_KEY` | OpenAI moderation | if AI mod live | Stub/unconfigured in snapshot |
| `HIVE_API_KEY` | Hive AI | optional alternate | — |
| `ONFIDO_API_TOKEN` | KYC Onfido | if `KYC_PROVIDER=onfido` | KYC stub |
| `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` | KYC Sumsub | if sumsub | — |
| `KYC_PROVIDER` | e.g. `onfido`, `sumsub` | optional | Warnings in `validateEnv` |
| `CLOUDFLARE_IP_REPUTATION_ENABLED` | `true` to use CF reputation | optional | Feature off |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | CF API | if reputation on | — |
| `CLOUDFLARE_TURNSTILE_SECRET_KEY`, `CLOUDFLARE_TURNSTILE_SITE_KEY` | Captcha | if Turnstile | — |

---

## Web (Vite)

See `packages/web/.env.example`. Prefix: **`VITE_`**.

| Variable | Description | Required for public launch? | Fallback |
|----------|-------------|------------------------------|----------|
| `VITE_API_URL` | API base URL | **yes** | Empty base — broken API calls |
| `VITE_WS_URL` | WebSocket URL | optional | Derived from `VITE_API_URL` in several hooks |
| `VITE_STRIPE_KEY` | Publishable key for Elements | if Stripe checkout on web | Stripe UI broken |
| `VITE_SENTRY_DSN` | Client errors | optional | No Sentry |
| `VITE_SIFT_BEACON_KEY` | Sift beacon | optional | No client beacon |
| `VITE_ENABLE_ADS`, `VITE_ENABLE_COMPLIANCE` | Nav feature flags | optional | Links hidden if false |

**Do not** invent `ENABLE_PUSH` / `ENABLE_LIVE` / `ENABLE_AI` unless you add them to the codebase; nav uses **`VITE_*`** flags from `packages/web/src/config/nav.js` where applicable.

---

## Verification

After setting env, run **`docs/PRODUCTION-VERIFICATION-STEPS.md`** and check **`GET /health`** for `checks.provider_states`.
