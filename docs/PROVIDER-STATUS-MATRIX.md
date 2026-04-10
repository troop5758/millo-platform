# PROVIDER STATUS MATRIX

How Millo surfaces **live / stub / disabled / unconfigured** for external providers. **Env-based only** — no claim that runtime calls to third parties were made.

**Sources:** `packages/api/src/lib/providerState.js`, `GET /health` (via `healthDashboard` / provider checks), payment response headers `X-Millo-Payment-Mode`, `X-Millo-Payment-Configured`.

**Align with:** `docs/GAPS-AND-ROUTES-INDEX.md`, `docs/ENV-SETUP-GUIDE.md`.

---

## How mode is determined

| Signal | Logic (summary) |
|--------|------------------|
| **Payments** | Stripe via `@millo/billing` `getStripe()`; PayPal/Wise via env presence (`providerState.js`). Aggregate: **live** if any configured, else **stub** with per-provider **unconfigured**. |
| **OAuth (health snapshot)** | `GOOGLE_CLIENT_ID`+`GOOGLE_CLIENT_SECRET`, `FACEBOOK_*`, `APPLE_CLIENT_ID`+`APPLE_TEAM_ID` — **note mismatch** with `OAUTH_*` registry (see below). |
| **AI moderation** | `AI_MODERATION_ENABLED !== 'true'` → **disabled**; else OpenAI or Hive key → **live**, else **stub**. |
| **KYC** | Onfido token or Sumsub pair → **live**, else **stub**. |
| **Email** | `EMAIL_PROVIDER` + transporter (see `@millo/notifications`); **console** = not production customer delivery. |
| **Push** | `FIREBASE_SERVER_KEY` / `EXPO_ACCESS_TOKEN` present → can be **live** for those channels; else effectively **disabled** for server-initiated push. |

---

## OAuth naming mismatch (documented)

| Concern | Env used by OAuth routes | Env used by `getOAuthState()` in `providerState.js` |
|---------|---------------------------|-----------------------------------------------------|
| Google | `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

Until unified in code, treat **`/health` OAuth block** as **potentially divergent** from actual login configuration. Prefer verifying **real login flows** and **`getAuthProviders()`** behavior.

---

## Matrix

| Area | Provider / channel | Mode when “live” | Mode when not | Surfaced where |
|------|-------------------|-------------------|---------------|----------------|
| Payments | Stripe | keys load + `getStripe()` truthy | **unconfigured** (per-provider) | `GET /health`, `X-Millo-*` headers on money routes |
| Payments | PayPal | `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` | **unconfigured** | same |
| Payments | Wise | `WISE_API_TOKEN` | **unconfigured** | same |
| Payments | Aggregate | any live → payments **live**; none → **stub** | — | `GET /health` `payments.mode` |
| Auth | Google (routes) | `OAUTH_GOOGLE_*` set | disabled in registry | Auth UI / `/auth/providers` patterns |
| Auth | Google (health) | `GOOGLE_*` set | **unconfigured** in snapshot | `GET /health` `oauth.google` |
| Email | SendGrid/SMTP/etc. | `EMAIL_PROVIDER` real + credentials | **stub** (`console`) | Boot logs, `productionGuard`, notifications package |
| Push | FCM | `FIREBASE_SERVER_KEY` | **disabled** for FCM path | Push send path in `notifications` |
| Push | Expo | `EXPO_ACCESS_TOKEN` (recommended) | partial function | Expo push path |
| Safety | AI mod | `AI_MODERATION_ENABLED` + key | **disabled** or **stub** | `GET /health` `aiModeration` |
| Safety | KYC | Onfido/Sumsub env | **stub** | `GET /health` `kyc` |
| Safety | Cloudflare reputation | `CLOUDFLARE_IP_REPUTATION_ENABLED` + token/account | off / null | IP reputation service (not same object as health snapshot unless wired) |

---

## UI honesty

The web app does **not** automatically show every cell of this matrix. **Hardening** task: surface provider/disabled states consistently where money and safety UX depend on them (`docs/PRODUCTION-CHECKLIST.md`).

---

## Optional aggregated helper

`packages/api/src/utils/providerStatus.js` returns a single object combining `getProviderStateSnapshot()` plus **email** and **push** summaries (env-only). Not a substitute for integration tests.
