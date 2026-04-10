# FINAL PHASE — Production Gate

**Owns:** Integration tests, Load tests, Security checklist, Launch checklist.

**Depends on:** ALL phases.

---

## Deliverables

- **Integration tests** — `scripts/integration-tests.js`. Hits /health, security headers (CSP, HSTS), /security/ledger-integrity, /security/kill-switches, /observation/recommendations. Set `BASE_URL` or `API_URL` for target (default `http://localhost:3000`).
- **Load tests** — `scripts/load-test.js`. Concurrent requests to /health. Usage: `node scripts/load-test.js [concurrency] [duration_sec]`. Reports RPS and latency (p50, p95, p99).
- **Security checklist** — `docs/security-checklist.md`. Phase 20 security controls (CSP, HSTS, rate limit, Redis/Mongo AUTH, SSH hardening, backup encryption, ledger tamper detection, kill-switch). Complete before go-live.
- **Launch checklist** — `docs/launch-checklist.md`. Infrastructure, application, validation, security, compliance, go-live.

## How to automatically install / run

**Infrastructure (Phase 18 — Ubuntu server)**  
On Ubuntu 22.04, one-command install of infra + app deps + build:

```bash
cd /path/to/millo
sudo bash infra/install-all.sh
```

To clone then install: set `REPO_URL` to your repo and run the script (it will clone into `INSTALL_DIR` then re-run from the clone): `REPO_URL=https://github.com/your-org/millo.git sudo bash infra/install-all.sh` (script must be available at that URL or copy install-all.sh to the server first).

Then: edit `.env`, point DNS to the server, run `sudo bash infra/tls-letsencrypt.sh`, and optionally install `infra/cert-renewal.cron`, `infra/logrotate-millo.conf`, `infra/backup.cron`.

**Final Phase (this phase) — no install; run validations and tests**  
- Check deliverables exist: `npm run validate:final`
- Run all phase validations + integration tests (production gate): `npm run production-gate` (API must be up for integration tests to pass).

---

## Running the production gate

For full pass, start the API first (e.g. `npm run start:api` in another terminal), then:

```bash
npm run build
npm run production-gate
```

With API running:

```bash
npm run start:api &
node scripts/integration-tests.js
node scripts/load-test.js 10 15
```

## Final output

```
========================================
  MILLO ENTERPRISE PLATFORM READY
  https://milloapp.com
========================================
```

---

**MILLO ENTERPRISE PLATFORM READY — https://milloapp.com**
