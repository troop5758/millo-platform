# Launch Checklist - Millo Enterprise Platform

**Production gate.** Complete before go-live. https://milloapp.com

See also: `docs/DNS-SETUP.md`, `docs/BACKUP-RESTORE.md`, `docs/ROLLBACK-PLAN.md`, `docs/OPERATIONAL-BOOTSTRAP.md`.

## Infrastructure

- [ ] DNS: milloapp.com, api.milloapp.com, cdn.milloapp.com point to production (see docs/DNS-SETUP.md)
- [ ] TLS: Let's Encrypt certs installed; infra/tls-letsencrypt.sh run; renewal cron active
- [ ] Firewall: UFW enabled (22, 80, 443); infra/ufw.sh applied
- [ ] Fail2Ban: enabled and running
- [ ] MongoDB: running; indexes synced; backup/encryption configured
- [ ] Redis: running (if used)
- [ ] PostgreSQL: running for ledger (if used)

## Application

- [ ] .env populated from .env.example; no secrets in repo
- [ ] npm run build succeeds (or use infra/install-all.sh for full automated install including build)
- [ ] node scripts/deploy.js run (or equivalent; install-all.sh already runs install + build)
- [ ] PM2: millo-api and millo-workers running; pm2 save and pm2 startup done
- [ ] NGINX: config in place; nginx -t; reload after TLS

## Validation

- [ ] npm run validate:bootstrap passes
- [ ] npm run validate:schemas passes
- [ ] All phase validations (validate:phase3 through validate:phase20) pass
- [ ] Integration tests: node scripts/integration-tests.js (API running)
- [ ] Load test: node scripts/load-test.js (optional; verify RPS/latency)

## Security

- [ ] Security audit report (docs/security-audit-report.md) reviewed/signed
- [ ] Security checklist (docs/security-checklist.md) complete
- [ ] OWASP scan clean (validate:phase20)
- [ ] Kill-switches verified (GET /security/kill-switches)
- [ ] Ledger integrity: GET /security/ledger-integrity returns valid

## Compliance and Legal

- [ ] Terms of Service and Privacy Policy live and linked
- [ ] Cookie consent implemented and tested
- [ ] DSAR and consent logging (Phase 11) verified

## Monitoring and Alerting

- [ ] Prometheus scraping API: `cd infra/monitoring && docker compose up -d`
- [ ] Grafana dashboards for API metrics (http://localhost:3001, admin/admin)
- [ ] SENTRY_DSN set in .env; errors flowing to Sentry
- [ ] Alert rules active (infra/monitoring/alerts.yml); Alertmanager optional for notifications

## Go-live

- [ ] Monitoring and alerting configured
- [ ] Backup and restore tested (see docs/BACKUP-RESTORE.md)
- [ ] Rollback plan documented (see docs/ROLLBACK-PLAN.md)
- [ ] Final sign-off: _________________ Date: ________

**MILLO ENTERPRISE PLATFORM READY - https://milloapp.com**
