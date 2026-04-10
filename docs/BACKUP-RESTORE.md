# Backup and Restore — Millo Platform

**Production readiness.** https://milloapp.com

## Backup

### Automated (Cron)

1. Install cron job:
   ```bash
   sudo cp infra/backup.cron /etc/cron.d/millo-backup
   sudo chmod 644 /etc/cron.d/millo-backup
   ```

2. Ensure `MONGODB_URI` (or `MONGO_URI`) is set in `.env` or `infra/backup-cron.sh`.

3. Set `BACKUP_DIR` if needed (default: `/var/backups/millo`):
   ```bash
   export BACKUP_DIR=/var/backups/millo
   ```

4. Backups run daily at 02:00. Output: `mongo-YYYYMMDD.archive.gz`.

### Manual Backup

```bash
cd /path/to/millo
source .env  # or: set -a && source .env && set +a
BACKUP_DIR="${BACKUP_DIR:-/var/backups/millo}"
mkdir -p "$BACKUP_DIR"
mongodump --uri="$MONGODB_URI" --archive --gzip > "$BACKUP_DIR/mongo-$(date +%Y%m%d).archive.gz"
```

### Encryption (Optional)

See `infra/backup-encryption.md` for encrypting backups with GPG.

---

## Restore

### MongoDB Restore

1. Stop the API and workers to avoid writes during restore:
   ```bash
   pm2 stop millo-api millo-workers
   ```

2. Restore from archive:
   ```bash
   mongorestore --uri="$MONGODB_URI" --archive --gzip < /var/backups/millo/mongo-YYYYMMDD.archive.gz
   ```

3. Restart services:
   ```bash
   pm2 start millo-api millo-workers
   ```

### Drop Existing Data (Full Restore)

To replace the database entirely:

```bash
mongorestore --uri="$MONGODB_URI" --archive --gzip --drop < /var/backups/millo/mongo-YYYYMMDD.archive.gz
```

---

## Verification

After restore:

1. Run ledger integrity check: `curl https://api.milloapp.com/security/ledger-integrity`
2. Run integration tests: `BASE_URL=https://api.milloapp.com node scripts/integration-tests.js`
3. Verify critical flows (login, payments) manually.

**MILLO ENTERPRISE PLATFORM — https://milloapp.com**
