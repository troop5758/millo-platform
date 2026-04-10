#!/bin/bash
# Redis provisioning — Ubuntu 22.04. https://milloapp.com
set -e
echo "[millo-infra] Provisioning Redis..."
apt-get install -y redis-server
sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf 2>/dev/null || true
systemctl enable redis-server
systemctl start redis-server
echo "[millo-infra] Redis installed and enabled on boot."
