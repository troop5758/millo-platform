# Cloudflare Bot Management

Edge-level bot and abuse protection for **https://milloapp.com**. Complements in-app rate limiting, CAPTCHA, and risk scoring.

See also **Part 9 — Global security**: `infra/cloudflare/global-security-part9.md` (WAF, DDoS, rate limiting, zero-trust API).

---

## Overview

- **Bot Fight Mode** (free): Challenges likely bots; can be enabled per zone.
- **Super Bot Fight Mode** (paid): More granular rules, machine-learning scores, allow/block/challenge by score.
- **WAF + rate limiting:** Custom rules and rate limiting at the edge reduce bad traffic before it hits the API.

---

## Recommended Setup

1. **DNS / proxy**
   - Ensure milloapp.com and api.milloapp.com (or your API host) proxy through Cloudflare (orange cloud).

2. **Bot Fight Mode (or Super Bot Fight Mode)**
   - Security → Bots → Configure:
     - Enable Bot Fight Mode, or
     - Super Bot Fight Mode with action (Allow / Managed Challenge / Block) by score threshold.

3. **Rate limiting (WAF)**
   - Security → WAF → Rate limiting rules:
     - e.g. limit requests per IP to `/api/*` or `api.milloapp.com` to avoid overwhelming the origin. Align with app-level limits (see Phase 20, `RATE_LIMIT_MAX` / nginx `limit_req`).

4. **CAPTCHA / challenge**
   - Use Cloudflare Turnstile for challenges (aligned with Millo’s CAPTCHA provider: `CAPTCHA_PROVIDER=turnstile`, `CLOUDFLARE_TURNSTILE_SITE_KEY`, `CLOUDFLARE_TURNSTILE_SECRET_KEY`).
   - Optional: WAF custom rules that trigger Managed Challenge for suspicious requests (e.g. high bot score, no cookie).

5. **DDoS**
   - Cloudflare’s default DDoS protection is on for proxied traffic; no extra config required unless you add custom DDoS overrides.

---

## Environment / Integration

- **Turnstile (CAPTCHA):** Backend uses `captchaService` with `CAPTCHA_PROVIDER=turnstile` and Cloudflare keys. Frontend loads Turnstile script and sends the token to the API where required (e.g. login, high-risk actions).
- **No extra env vars** are required in the app for Bot Fight Mode or Super Bot Fight Mode; they are configured in the Cloudflare dashboard.

---

## Domain

All configuration applies to **https://milloapp.com** and the API host used in production (e.g. api.milloapp.com).
