# SETUP — PRODUCTION

## Purpose

This document defines what must be **configured** and **verified** for a real Millo launch.

It is **not** a feature checklist. It is **system setup** and **truth alignment** with the API, web, and ops.

**Align with:** `docs/PRODUCTION-CHECKLIST.md`, `docs/LAUNCH-BLOCKERS.md`, `docs/GAPS-AND-ROUTES-INDEX.md`.

**Windows workspace install errors (symlink / EISDIR):** `docs/WINDOWS-WORKSPACE-INSTALL.md`

**Ubuntu 22.04 server bootstrap:** `docs/DEPLOY-UBUNTU-22.04.md`, `scripts/install-ubuntu-22.04.sh`

This document does **not** assert that providers are configured or that the system is production-ready.

---

## Required providers

### Auth

- Configure **OAuth** providers you ship (see `packages/api/src/services/oauthProviders.js` — `OAUTH_*` variables).
- Ensure **consistent** handling when a provider is disabled or unset (API + web).

**Failure mode:** unconfigured OAuth buttons or half-broken redirects (`docs/LAUNCH-BLOCKERS.md` §2).

**Note:** `productionGuard` requires at least one enabled OAuth provider in production (`packages/api/src/core/productionGuard.js`).

---

### Payments

- Configure **Stripe** if coins/card flows are in launch scope (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` for webhooks).
- Configure **PayPal** / **Wise** only if payouts are promised (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `WISE_API_TOKEN`).

**Rules:**

- No **stub money UX** in production for real customers (`PAYMENT_PROVIDER` must not be `sandbox`/`dev`/`coin` as primary in prod — see `productionGuard`).
- **Provider mode** must be explicit (headers / `GET /health` `checks.provider_states` — see `packages/api/src/lib/providerState.js`).

---

### Email

- Set `EMAIL_PROVIDER` to a **real** provider (`sendgrid`, `aws_ses`, `resend`, `smtp`) and the matching credentials (see `packages/notifications/src/email/index.js` and `docs/ENV-SETUP-GUIDE.md`).

**Not acceptable for customer comms:** `EMAIL_PROVIDER=console` in production unless launch scope explicitly allows it and `EMAIL_CONSOLE_DISALLOWED` is not enforcing.

---

### Push (optional)

- Only configure if push is in launch scope.
- Repo uses **`FIREBASE_SERVER_KEY`** (FCM legacy) and/or **`EXPO_ACCESS_TOKEN`** (Expo push) — see `packages/notifications/src/push.js`.

---

### Trust / safety

Decide explicitly per launch:

- **KYC:** `KYC_PROVIDER` + provider-specific keys (`ONFIDO_API_TOKEN`, `SUMSUB_*`, etc.) — see `validateEnv.js` `KYC_PROVIDER_VARS`.
- **AI moderation:** `AI_MODERATION_ENABLED=true` plus `OPENAI_API_KEY` and/or `HIVE_API_KEY` — see `providerState.js` `getAiModerationState`.
- **Cloudflare:** `CLOUDFLARE_IP_REPUTATION_ENABLED`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (and Turnstile vars if captcha used).

**Rule:** do not imply enforcement that is not active (`docs/LAUNCH-BLOCKERS.md` §3).

---

## System alignment

### Support / orders

- **One** clear order-linked support model; resolve `Ticket` vs `SupportTicket` ambiguity before broad launch (`docs/GAPS-AND-ROUTES-INDEX.md`).

### Money safety

- Review **locking / idempotency** on race-sensitive paths beyond the narrowest flows (`docs/PRODUCTION-CHECKLIST.md`).

### Live

- Ship only **supported** live features; metadata routes hardened (`PUT /streams/:id/metadata`, `PATCH /live/stream/:streamId`).

### Discovery

- No **infinite FYP** claims unless backend behavior matches (`docs/GAPS-AND-ROUTES-INDEX.md`).

### Admin / AI

- AI admin: **persisted** or **visibly read-only** — no fake “saved” UX.

### i18n

- No raw keys on **launch-critical** screens.

### RBAC

- Production **roles** only — **no** DEV toggles as authorization (`docs/PRODUCTION-CHECKLIST.md`).

---

## Ops / engineering

### Observability

- Worker + queue + **provider** visibility sufficient for basic on-call (`docs/PRODUCTION-VERIFICATION-STEPS.md`, `GET /health`).

### Secrets

- Managed secrets for all providers — **no** keys in git.

### Backups / DR

- DB (and critical object storage) backup strategy **defined** and **tested**.

### Rate limits / security

- `DISABLE_RATE_LIMIT` not `true` in production; public surfaces reviewed.

### Production URLs

- **Frontend:** `https://milloapp.com` (set `FRONTEND_URL`, `CORS_ORIGIN`, web `VITE_API_URL` / `VITE_WS_URL` consistently).

---

## Not required

- **Kafka** as primary bus (not how the app is documented to run today).
- **ELK/Loki** bundled in-repo.

**Note:** `packages/api/src/bootstrap/validateEnv.js` lists `KAFKA_BROKERS` under “important” warnings — treat as **optional** for launch unless your deployment explicitly depends on it.

---

## Env templates and detail

- `packages/api/.env.example` — API variables grouped by area.
- `packages/web/.env.example` — web client variables.
- `docs/ENV-SETUP-GUIDE.md` — descriptions, required-for-launch, fallbacks.

---

## Optional helpers (API)

- `packages/api/src/utils/providerStatus.js` — aggregated **env-only** status object (no external calls).
- `packages/api/src/middleware/providerStatus.middleware.js` — optional Fastify hook attaching `request.providerStatus` (**not** registered by default; wire in `app.js` if you want it).

---

## Final reference

Use:

- `docs/PRODUCTION-CHECKLIST.md`
- `docs/LAUNCH-BLOCKERS.md`
- `docs/PRODUCTION-VERIFICATION-STEPS.md`

to determine launch readiness. **Do not** assume green builds/tests without evidence.
