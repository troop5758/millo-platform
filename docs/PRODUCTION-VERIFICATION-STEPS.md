# PRODUCTION VERIFICATION STEPS

Step-by-step checks after configuration. **Evidence-based** — tick only what you actually ran.

**Align with:** `docs/PRODUCTION-CHECKLIST.md`, `docs/LAUNCH-BLOCKERS.md`, `docs/SETUP-PRODUCTION.md`.

Does **not** assert builds/tests are green.

---

## 0. Baseline

- [ ] API starts with intended `NODE_ENV=production` and required env (see `validateEnv` / startup logs).
- [ ] Web build points `VITE_API_URL` (and `VITE_WS_URL` if used) at the correct API.
- [ ] `GET /health` returns **200** and includes **`checks.provider_states`** (or documented equivalent).

---

## Auth

- [ ] **Login** works for each OAuth provider you **ship** (not only ones listed in health).
- [ ] **Disabled** provider: button hidden or clear “not configured” UX — no broken redirect loop.
- [ ] Password / magic-link paths work if they are in launch scope.

---

## Payments

- [ ] **Test charge** or **test checkout** succeeds on **live** Stripe (or scoped test mode per policy) — no silent **stub** path in prod for real users.
- [ ] **Webhook** delivery verified if you rely on webhooks (`STRIPE_WEBHOOK_SECRET` configured).
- [ ] PayPal/Wise: only if promised — run a **payout or sandbox-equivalent** per policy.
- [ ] UI does not show “success” that contradicts `X-Millo-Payment-Mode` / API body.

---

## Email

- [ ] Send a **real** message to a test inbox (transactional path you use in prod).
- [ ] Confirm `EMAIL_PROVIDER` is **not** `console` for customer-facing flows unless explicitly allowed.

---

## Push (if in launch scope)

- [ ] Register device token; send test push; message received on device.
- [ ] If not in scope: UI does **not** promise push.

---

## Safety

- [ ] **KYC:** if “live”, run a test verification flow; if **off/stub**, marketing and UI do not claim full verification.
- [ ] **AI moderation:** if `AI_MODERATION_ENABLED=false`, no UI implies automated moderation.
- [ ] **Cloudflare / Turnstile:** if enabled, captcha/reputation works; if disabled, no false “protected” copy.

---

## Feed / discovery

- [ ] Scroll/paging behaves as **documented** (best-effort / capped — **not** claimed as stable infinite).
- [ ] Empty and error states are acceptable; no raw API errors exposed to users.

---

## Live

- [ ] Only **supported** tools visible (filters/co-host: align with `docs/GAPS-AND-ROUTES-INDEX.md`).
- [ ] Metadata updates: authorized user can update; unauthorized cannot (smoke test).

---

## Admin / AI

- [ ] AI controls: if API is read-only/non-persistent, UI matches (**no** “saved” if nothing persisted).

---

## Support

- [ ] **One** clear path for order-linked issues (model + routes + internal runbook agreed).

---

## Ops

- [ ] **Workers/queues:** check documented metrics or admin surface; confirm not blind to stuck jobs.
- [ ] **Redis** connectivity confirmed if locks/rate limits depend on it.

---

## Web routes (sanity)

- [ ] Redirect aliases (`/shop` → `/feed`, etc.) behave as in `docs/WEB-ROUTING-INVENTORY.md`.
- [ ] No assumption that **every** URL is a distinct backend feature.

---

## Blocker re-check

If any item in **`docs/LAUNCH-BLOCKERS.md`** still applies, **do not** broaden public launch claims.
