# Rollback Plan — Millo Platform

**Production incident response.** https://milloapp.com

## Quick Rollback (Code Revert)

If a deployment introduces critical bugs:

```bash
cd /opt/millo  # or your INSTALL_DIR
sudo bash infra/rollback.sh [REVISION]
```

- **Default:** `HEAD~1` (previous commit)
- **Specific:** `abc123` (commit hash) or `v3.0.1` (tag)

The script will:
1. `git fetch origin main` (or master)
2. `git reset --hard REVISION`
3. Run `infra/rolling-restart.sh` (PM2 reload)

## Rolling Restart (No Code Change)

If you need to restart services without reverting code:

```bash
sudo bash infra/rolling-restart.sh
```

## Database Rollback

**MongoDB:** Restore from backup. See `docs/BACKUP-RESTORE.md`.

**Ledger:** The ledger is append-only. Do not attempt to "roll back" ledger entries. If a bad transaction occurred, use admin tools to issue a corrective entry (refund, credit) and log in AdminAuditLog.

## Environment Rollback

If `.env` changes caused issues:

1. Restore previous `.env` from backup or version control (if tracked).
2. Reload PM2: `pm2 reload pm2.config.js`

## Kill-Switch (Feature Disable)

To disable features without code deploy:

```bash
curl -X POST https://api.milloapp.com/dashboards/admin/kill-switch \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"which":"ads","enabled":false}'
```

Available switches: `ads`, `milla`, `liveFilters`, `aiOptimization`.

## Post-Rollback Checklist

- [ ] Verify `/health` returns 200
- [ ] Run `node scripts/integration-tests.js`
- [ ] Check Sentry for new errors
- [ ] Notify stakeholders
- [ ] Create incident report and root-cause analysis

**MILLO ENTERPRISE PLATFORM — https://milloapp.com**
