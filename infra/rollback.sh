#!/bin/bash
# Rollback — revert to previous Git revision and rolling restart. https://milloapp.com
# Run on production server: sudo bash infra/rollback.sh [REVISION]
# Optional REVISION: e.g. HEAD~1, or a commit hash. Default: HEAD~1

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REV="${1:-HEAD~1}"

cd "$REPO_ROOT"
echo "[millo-rollback] Reverting to $REV..."
git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null || true
git reset --hard "$REV"
echo "[millo-rollback] Running rolling restart..."
bash "$SCRIPT_DIR/rolling-restart.sh"
echo "[millo-rollback] Done."
