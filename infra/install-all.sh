#!/usr/bin/env bash
# Millo — delegates to scripts/install-ubuntu-22.04.sh (single Ubuntu 22.04 installer).
# Usage:
#   From repo:     cd /path/to/millo && sudo bash infra/install-all.sh
#   Clone first:   sudo REPO_URL=https://example.com/millo.git INSTALL_DIR=/opt/millo bash infra/install-all.sh
#
# https://milloapp.com
set -euo pipefail
if [[ "$(id -u)" -ne 0 ]]; then
  echo "[millo-install] Run as root: sudo bash infra/install-all.sh"
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -n "${REPO_URL:-}" ]]; then
  INSTALL_DIR="${INSTALL_DIR:-/opt/millo}"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq git
  if [[ ! -f "$INSTALL_DIR/package.json" ]]; then
    if [[ -n "${MILLO_GIT_BRANCH:-}" ]]; then
      git clone --branch "$MILLO_GIT_BRANCH" --depth 1 "$REPO_URL" "$INSTALL_DIR"
    else
      git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    fi
  fi
  export MILLO_GIT_URL=""
  export MILLO_INSTALL_DIR="$INSTALL_DIR"
  exec bash "$INSTALL_DIR/scripts/install-ubuntu-22.04.sh"
fi

exec bash "$REPO_ROOT/scripts/install-ubuntu-22.04.sh" "$@"
