#!/usr/bin/env bash
# Millo — backward-compatible wrapper. Canonical installer: install-ubuntu-22.04.sh
# https://milloapp.com
if [ -z "${BASH_VERSION:-}" ]; then
  echo "Use: sudo bash scripts/millo-full-install.sh" >&2
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/install-ubuntu-22.04.sh" "$@"
