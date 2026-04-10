#!/bin/bash
# Environment file loader — source before starting app. https://milloapp.com
# Usage: source infra/env-loader.sh && node packages/api/src/index.js
# Or use PM2 env_file in pm2.config.js.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
  echo "[millo-infra] Loaded env from $ENV_FILE"
fi
export NODE_ENV="${NODE_ENV:-production}"
export MILLO_APP_URL="${MILLO_APP_URL:-https://milloapp.com}"
