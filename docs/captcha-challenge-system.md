# CAPTCHA Challenge System

Triggered when **risk score is high** (e.g. > 70). Instead of blocking, the API returns `CAPTCHA_REQUIRED`; the client shows the challenge and resubmits with the token.

## Trigger

```js
if (riskScore > 70) requireCaptcha();
```

- **Login:** After credentials are valid, `riskEngine.calculateRisk(userId)` is used. If score > threshold and CAPTCHA is enabled, the request must include a valid CAPTCHA token or the server responds with `403` and `{ error: 'CAPTCHA_REQUIRED', requireCaptcha: true, siteKey, provider }`.
- **Gift send:** After `evaluateGiftRisk`, if `riskScore` > threshold, same CAPTCHA requirement applies.

## Providers

| Provider | Env (site key / secret) | Verify endpoint |
|----------|-------------------------|------------------|
| **Cloudflare Turnstile** | `CLOUDFLARE_TURNSTILE_SITE_KEY`, `CLOUDFLARE_TURNSTILE_SECRET_KEY` | `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` |
| **hCaptcha** | `HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET_KEY` | `POST https://hcaptcha.com/siteverify` |
| **Arkose Labs** | `ARKOSE_PUBLIC_KEY`, `ARKOSE_PRIVATE_KEY` | Stub: token presence check; replace with Arkose server API when keys are set. |

Set **`CAPTCHA_PROVIDER`** to `turnstile`, `hcaptcha`, or `arkose`. Set **`CAPTCHA_THRESHOLD`** (default `70`) to the risk score above which CAPTCHA is required.

## Client flow

1. Call login (or gift send) without token.
2. If response is `403` with `error: 'CAPTCHA_REQUIRED'`, use `siteKey` and `provider` to render the widget (Turnstile / hCaptcha / Arkose).
3. On challenge completion, get the token from the widget and resubmit the same request with:
   - **Body:** `captchaToken: "<token>"` or
   - **Header:** `X-Captcha-Token: <token>`

Optional: **GET /auth/captcha/config** returns `{ enabled, siteKey, provider }` so the client can pre-load the widget when CAPTCHA is enabled.

## Service

**`packages/api/src/services/captchaService.js`**

- **`isEnabled()`** — true if provider and secret are configured.
- **`getSiteKey()`** — site key for the client widget.
- **`getProvider()`** — `turnstile` | `hcaptcha` | `arkose`.
- **`requireCaptcha(riskScore)`** — true when CAPTCHA is enabled and `riskScore > CAPTCHA_THRESHOLD`.
- **`verifyToken(token, remoteip)`** — verifies the token with the configured provider; returns `{ success, error? }`.

## References

- [anti-bot-system-architecture.md](anti-bot-system-architecture.md) — Action Layer (CAPTCHA challenge)
- [bot-risk-scoring-engine.md](bot-risk-scoring-engine.md) — Risk score
- `packages/api/src/services/captchaService.js`
- `packages/api/src/routes/auth.js` — login CAPTCHA gate
- `packages/api/src/routes/content.js` — gift send CAPTCHA gate
