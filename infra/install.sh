#!/usr/bin/env bash
# Millo legacy infra entry — use scripts/install-ubuntu-22.04.sh or infra/install-all.sh
# https://milloapp.com
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
exec bash "$REPO_ROOT/scripts/install-ubuntu-22.04.sh" "$@"
