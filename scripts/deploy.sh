#!/bin/bash
# Millo — deploy web static assets + restart API (PM2).
# Run from repo root on the target host: sudo bash scripts/deploy.sh
# Requires: git, npm, rsync, pm2. Web root: /var/www/millo/web (see infra/nginx).
# https://milloapp.com
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIST="$REPO_ROOT/packages/web/dist"

cd "$REPO_ROOT"

echo "🚀 Deploying Millo..."

git pull origin main

npm install
npm run build

if [ ! -d "$WEB_DIST" ] || [ -z "$(ls -A "$WEB_DIST" 2>/dev/null)" ]; then
  echo "ERROR: packages/web/dist is missing or empty after build." >&2
  exit 1
fi

mkdir -p /var/www/millo/web
rsync -av --delete "$WEB_DIST/" /var/www/millo/web/

pm2 restart millo-api

echo "✅ Deployment complete"
