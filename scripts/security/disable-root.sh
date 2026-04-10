#!/bin/bash
# Disable root SSH login — enforce PermitRootLogin no (Phase 10 infra hardening).
# Ensure key-based access for a non-root sudo user before running.
# Usage: sudo ./scripts/security/disable-root.sh
# https://milloapp.com

set -euo pipefail

SSHD_CONFIG="/etc/ssh/sshd_config"

if [ ! -f "$SSHD_CONFIG" ]; then
  echo "[disable-root] sshd config not found at $SSHD_CONFIG"
  exit 1
fi

# Replace existing PermitRootLogin line (commented or uncommented), or append if absent.
if grep -Eq '^\s*#?\s*PermitRootLogin\s+' "$SSHD_CONFIG"; then
  sudo sed -i -E 's/^\s*#?\s*PermitRootLogin\s+.*/PermitRootLogin no/' "$SSHD_CONFIG"
else
  echo 'PermitRootLogin no' | sudo tee -a "$SSHD_CONFIG" >/dev/null
fi

# Validate config before restart to avoid locking out SSH.
if command -v sshd >/dev/null 2>&1; then
  sudo sshd -t
fi

if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl restart sshd || sudo systemctl restart ssh
else
  sudo service ssh restart || sudo service sshd restart
fi

echo "[disable-root] Applied: PermitRootLogin no"
