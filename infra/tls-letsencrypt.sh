#!/bin/bash
# TLS — Let's Encrypt. Ubuntu 22.04. Run after DNS points to host. https://milloapp.com
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[millo-infra] TLS (Let's Encrypt)..."
apt-get install -y certbot python3-certbot-nginx
mkdir -p /var/www/certbot
certbot certonly --nginx -d milloapp.com -d www.milloapp.com -d api.milloapp.com -d cdn.milloapp.com \
  --non-interactive --agree-tos --email admin@milloapp.com --redirect
# Switch to full nginx config with SSL
cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/millo
nginx -t && systemctl reload nginx
echo "[millo-infra] SSL valid. Install cert-renewal for automatic renewal."
