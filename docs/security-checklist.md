# Security checklist — Phase 20

- [x] **CSP** — Content-Security-Policy header set (API and/or nginx).
- [x] **HSTS** — Strict-Transport-Security header (API + nginx).
- [x] **Rate limiting** — @fastify/rate-limit in API; nginx limit_req/limit_conn.
- [x] **DDoS configuration** — nginx limit_req_zone, limit_conn_zone on API.
- [x] **Redis AUTH** — Redis requirepass; see infra/redis-auth.md.
- [x] **Mongo AUTH** — MongoDB authentication enabled; see infra/mongo-auth.md.
- [x] **SSH hardening** — Key-based auth, hardening steps; see infra/ssh-hardening.md.
- [x] **TURN hardening** — Documented in infra/TURN-hardening.md.
- [x] **Secrets manager** — No hardcoded secrets; getSecret from env; infra/secrets-manager.md.
- [x] **Backup encryption** — Documented in infra/backup-encryption.md.
- [x] **Ledger tamper detection** — economy.verifyLedgerIntegrity(); sequence continuity.
- [x] **Global kill-switch validation** — Registry in @millo/security; GET /security/kill-switches; all switches enforced in code.
- [x] **OWASP scan** — Run `npm run security:scan` (requires Docker, API running); CI runs on push; reports in `scripts/security/reports/`.

Validation: `npm run validate:phase20`.

https://milloapp.com
