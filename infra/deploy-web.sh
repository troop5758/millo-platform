#!/bin/bash
# Deploy web app to /var/www/millo/web so milloapp.com does not 500.
# Run from repo root: sudo bash infra/deploy-web.sh
# Line endings: must be LF (Unix). On Windows: git config core.autocrlf false, or: sed -i 's/\r$//' infra/deploy-web.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

mkdir -p /var/www/millo/web /var/www/millo/cdn
if [ -d "$REPO_ROOT/packages/web/dist" ] && [ -n "$(ls -A "$REPO_ROOT/packages/web/dist" 2>/dev/null)" ]; then
  # Mirror dist exactly so old Vite chunks (index-OLDHASH.js) are removed; plain cp leaves stale files.
  if command -v rsync >/dev/null 2>&1; then
    rsync -av --delete "$REPO_ROOT/packages/web/dist/" /var/www/millo/web/
  else
    find /var/www/millo/web -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a "$REPO_ROOT/packages/web/dist/." /var/www/millo/web/
  fi
  echo "[millo-infra] Web app deployed to /var/www/millo/web (from $REPO_ROOT/packages/web/dist)"
  if command -v sha256sum >/dev/null 2>&1; then
    echo "[millo-infra] index.html checksum:"
    sha256sum /var/www/millo/web/index.html
  fi
else
  echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Millo</title></head><body><h1>Millo</h1><p>Platform ready.</p></body></html>' > /var/www/millo/web/index.html
  echo "[millo-infra] Placeholder index at /var/www/millo/web (run: npm run build -w @millo/web, then re-run this script)"
fi
