#!/bin/bash
# PostgreSQL provisioning — Ubuntu 22.04. Ledger / optional. https://milloapp.com
set -e
echo "[millo-infra] Provisioning PostgreSQL..."
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
sudo -u postgres createuser -s millo 2>/dev/null || true
sudo -u postgres createdb millo_ledger 2>/dev/null || true
echo "[millo-infra] PostgreSQL installed and enabled on boot."
