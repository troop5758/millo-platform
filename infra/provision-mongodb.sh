#!/bin/bash
# MongoDB provisioning — Ubuntu 22.04. https://milloapp.com
set -e
echo "[millo-infra] Provisioning MongoDB..."
# Remove any bad list file from previous CRLF run (e.g. mongodb-org-6.0.list with trailing cr)
rm -f /etc/apt/sources.list.d/mongodb-org-6.0.list*
wget -qO- https://www.mongodb.org/static/pgp/server-6.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-6.0.gpg 2>/dev/null || true
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-6.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list
apt-get update
apt-get install -y mongodb-org
systemctl enable mongod
systemctl start mongod
echo "[millo-infra] MongoDB installed and enabled on boot."
