# Part 9 — Global security

**Production domain:** https://milloapp.com (and `api.milloapp.com`, `cdn.milloapp.com`, `hls.milloapp.com` as applicable).

**Umbrella (WAF, regional rate limits, bots, execution checklist):** `infra/global-security.md`

---

## WAF (Cloudflare)

Configure in the Cloudflare dashboard for the Millo zone:

| Control | Purpose |
|--------|---------|
| **WAF managed rules** | Block common exploits (OWASP-style), SQLi, XSS probes on API/HTML surfaces. |
| **Custom rules** | Country/block lists, path-based blocks, challenge for suspicious ASNs. |
| **Rate limiting** | Edge limits per IP (and optionally per URI) before traffic hits origin — align with app `@fastify/rate-limit` and Redis (see Phase 20). |

---

## DDoS protection

- **Proxied traffic** (orange cloud) receives Cloudflare **automatic DDoS mitigation** (L3/L4/L7 as applicable).
- No application env vars required; tune only if you add custom DDoS overrides in Advanced settings.

---

## Bot mitigation

- **Bot Fight Mode** / **Super Bot Fight Mode**, Turnstile, WAF — see **`infra/cloudflare-bot-management.md`**.
- Complements **edge moderation Worker** (`infra/cloudflare/edge-ai-moderation.md`) and API-side fraud/risk services.

---

## Zero Trust API (Millo application)

When **`ZERO_TRUST_DEVICE_FINGERPRINT=true`** the API enforces:

1. **Authenticated user** — valid `Authorization: Bearer <JWT or session token>` (same resolution as `createAuthMiddleware`).
2. **Device fingerprint** — header **`X-Device-Fingerprint`** or **`X-Millo-Device-Fingerprint`** (min 8 chars), aligned with `/fraud/track` and `deviceFingerprintHash`.

**Skipped paths** (comma-separated prefixes in **`ZERO_TRUST_SKIP_PREFIXES`**, defaults include `/health`, `/auth/`, webhook paths):

- Health, auth flows, and payment webhooks must remain reachable without the fingerprint header.

See `packages/api/src/middleware/zeroTrustDeviceFingerprint.js` and `docs/architecture-infrastructure-stack.md`.

---

## Client checklist

- Send **Bearer token** on all protected API calls.
- After login, register device via **`POST /fraud/track`** or **`POST /security/device`**, then send the returned fingerprint in **`X-Device-Fingerprint`** on subsequent requests when zero-trust mode is on.
