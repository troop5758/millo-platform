#!/bin/bash
# Millo backup — MongoDB (and optionally Redis). Read backup-encryption.md for encryption.
# https://milloapp.com
# Set MONGO_URI and BACKUP_DIR (e.g. in .env or this script). Run from cron; see backup.cron.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load env if present
[ -f "$REPO_ROOT/.env" ] && set -a && source "$REPO_ROOT/.env" && set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/millo}"
mkdir -p "$BACKUP_DIR"

# Support both MONGODB_URI (from .env.example) and MONGO_URI (legacy)
MONGO_URI="${MONGODB_URI:-${MONGO_URI:-}}"
if [ -z "$MONGO_URI" ]; then
  echo "[millo-backup] MONGODB_URI/MONGO_URI not set; skip MongoDB dump"
  exit 0
fi

DATE="$(date +%Y%m%d)"
OUT="$BACKUP_DIR/mongo-$DATE.archive.gz"

mongodump --uri="$MONGO_URI" --archive --gzip > "$OUT" 2>/dev/null || true
[ -f "$OUT" ] && echo "[millo-backup] MongoDB dump: $OUT" || echo "[millo-backup] MongoDB dump failed"

# Optional: Redis SAVE and copy RDB
# redis-cli SAVE && cp /var/lib/redis/dump.rdb "$BACKUP_DIR/redis-$DATE.rdb"
