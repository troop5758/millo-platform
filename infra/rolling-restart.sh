#!/bin/bash
# Zero-downtime rolling restart — PM2 reload. https://milloapp.com
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/bin:$PATH"
if command -v pm2 &>/dev/null; then
  pm2 reload "$SCRIPT_DIR/pm2.config.js"
  pm2 save
  echo "[millo-infra] Rolling restart completed (pm2 reload)."
else
  echo "[millo-infra] PM2 not found; skip rolling restart."
fi
