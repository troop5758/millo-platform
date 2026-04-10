# Phase 20 — Security Hardening

**Owns:** Rate limiting, CSP, HSTS, Redis AUTH, Mongo AUTH, SSH hardening, Backup encryption, Ledger tamper detection, Global kill-switch validation.

**Depends on:** Phase 18.

---

## Scope

- **Rate limiting** — @fastify/rate-limit in API (getRateLimitConfig from @millo/security); nginx limit_req/limit_conn on API.
- **CSP** — Content-Security-Policy header (API via @millo/security).
- **HSTS** — Strict-Transport-Security header (API + nginx).
- **Redis AUTH** — Redis must be configured with authentication (requirepass); see infra/redis-auth.md.
- **Mongo AUTH** — MongoDB must be configured with authentication (createUser, authorization); see infra/mongo-auth.md.
- **SSH hardening** — Documented in infra/ssh-hardening.md (key-based auth, disable root password, etc.).
- **Backup encryption** — Documented in infra/backup-encryption.md (mongodump/pg_dump with encryption).
- **Ledger tamper detection** — economy.verifyLedgerIntegrity() (sequence continuity); GET /security/ledger-integrity.
- **Global kill-switch validation** — Registry in @millo/security; GET /security/kill-switches returns current state; validator ensures registry exists.
- **Validation:** OWASP scan clean (no eval/dangerous patterns); security checklist passes.

---

## Package: @millo/security

- **getCSPHeader()**, **getHSTSHeader()** — For API response headers.
- **getRateLimitConfig()** — max, timeWindow for @fastify/rate-limit.
- **getKillSwitchRegistry()**, **isKillSwitchEnforced()** — Registry of ADS_ENABLED, MILLA_ENABLED, LIVE_FILTERS_ENABLED, AI_OPTIMIZATION_ENABLED.
- **getSecret(name)**, **getSecretRequired(name)** — Stub; no hardcoded secrets.

---

## API

- **app.js** — Registers @fastify/rate-limit; onSend hook sets Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options.
- **GET /security/ledger-integrity** — Returns result of economy.verifyLedgerIntegrity().
- **GET /security/kill-switches** — Returns kill-switch registry (current env values).

---

## Ledger tamper detection

- **economy.verifyLedgerIntegrity()** — Fetches all ledger entries by sequence; verifies no duplicate sequence, no gap or out-of-order; returns { valid, totalEntries } or { valid: false, reason, sequence/expected/got }.

---

## NGINX (infra/nginx.conf)

- **HSTS** — add_header Strict-Transport-Security on api and main site.
- **DDoS** — limit_req_zone, limit_conn_zone; limit_req zone=millo_api_limit burst=50 nodelay; limit_conn millo_conn 20 on API server.

---

## Infra docs

- **infra/redis-auth.md** — Redis AUTH (requirepass); app uses REDIS_PASSWORD or URL.
- **infra/mongo-auth.md** — MongoDB authentication (security.authorization, createUser); MONGO_URI with credentials.
- **infra/ssh-hardening.md** — SSH hardening (key-based auth, PasswordAuthentication no, Fail2Ban).
- **infra/backup-encryption.md** — Backup encryption; mongodump/pg_dump with encryption; secrets for passphrase.
- **infra/TURN-hardening.md** — TLS, short-lived credentials, rate limit, audit.
- **infra/secrets-manager.md** — No hardcoded secrets; env or vault; rotation.

---

## Validation

- **OWASP scan clean** — Script greps packages/api/src and packages/security/src for eval(, Function(, child_process.execSync, require('vm'); no matches allowed.
- **Security checklist** — Script verifies: API sets CSP and HSTS; API registers rate limit; ledger has verifyLedgerIntegrity; security has kill-switch registry (global kill-switch validation); nginx has HSTS and limit_req; docs/security-checklist.md exists; infra/redis-auth.md, infra/mongo-auth.md, infra/ssh-hardening.md, infra/backup-encryption.md exist.

Run: `npm run validate:phase20`.

---

## Domain

All bound to https://milloapp.com.
