#!/bin/bash
# Automatic renewal — Let's Encrypt. Run from cron or systemd timer. https://milloapp.com
set -e
certbot renew --quiet --deploy-hook "systemctl reload nginx"
echo "[millo-infra] Cert renewal completed."
