#!/bin/bash
# Firewall (UFW) — Ubuntu 22.04. https://milloapp.com
set -e
echo "[millo-infra] Configuring UFW..."
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
echo "[millo-infra] Firewall active (UFW enabled)."
