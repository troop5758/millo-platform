#!/bin/bash
# Fail2Ban — Ubuntu 22.04. https://milloapp.com
set -e
echo "[millo-infra] Configuring Fail2Ban..."
apt-get install -y fail2ban
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
EOF
systemctl enable fail2ban
systemctl restart fail2ban
echo "[millo-infra] Fail2Ban enabled on boot."
