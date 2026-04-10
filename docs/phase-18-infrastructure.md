# Phase 18 — Ubuntu Deployment

**Owns:** install.sh, nginx config, SSL setup, Mongo provisioning, Redis provisioning, Firewall, Fail2ban, PM2/systemd, Log rotation, Backup cron, Domain binding (milloapp.com).

**Depends on:** All backend phases.

---

## Scope

- **install.sh** — Infra-only installer: provisions MongoDB, Redis, Node, NGINX, PM2, UFW, Fail2Ban; TLS and env/S3 are follow-up.
- **install-all.sh** — Single automated install: same as install.sh plus app dependencies and build; optional clone via REPO_URL.
- **nginx config** — nginx.conf (and nginx-initial.conf): sites for milloapp.com, api.milloapp.com, cdn.milloapp.com with TLS.
- **SSL setup** — tls-letsencrypt.sh; cert-renewal.sh + cert-renewal.cron for Let's Encrypt.
- **Mongo provisioning** — provision-mongodb.sh; systemd enabled.
- **Redis provisioning** — provision-redis.sh; systemd enabled.
- **Firewall** — ufw.sh: allow 22, 80, 443; default deny; `ufw enable`.
- **Fail2ban** — fail2ban.sh; sshd jail; enabled on boot.
- **PM2/systemd** — pm2.config.js; install.sh runs `pm2 save` and `pm2 startup` for boot on restart.
- **Log rotation** — logrotate-millo.conf; install to /etc/logrotate.d/millo.
- **Backup cron** — backup.cron and backup-cron.sh; daily MongoDB dump (configure MONGO_URI, BACKUP_DIR).
- **Domain binding (milloapp.com)** — All configs bind https://milloapp.com, api.milloapp.com, cdn.milloapp.com.

**Validation:** SSL valid (config), firewall active (script), services boot on restart; log rotation and backup cron files present.

---

## Files (infra/)

| File | Purpose |
|------|---------|
| install.sh | Infra only; provisions Mongo, Redis, NGINX, PM2, UFW, Fail2Ban |
| install-all.sh | Full install: infra + npm install + build; optional REPO_URL clone |
| nginx.conf | NGINX server blocks; TLS paths; upstream to API; domain binding |
| pm2.config.js | PM2 ecosystem; api + workers; env_file; boot on restart |
| provision-mongodb.sh | Install and enable MongoDB |
| provision-postgresql.sh | Install and enable PostgreSQL; millo_ledger (optional) |
| provision-redis.sh | Install and enable Redis |
| ufw.sh | Firewall: UFW; allow 22, 80, 443 |
| fail2ban.sh | Fail2Ban with sshd jail |
| tls-letsencrypt.sh | SSL setup: obtain Let's Encrypt certs (run after DNS) |
| cert-renewal.sh | Certbot renew; reload nginx |
| cert-renewal.cron | Cron entry for cert renewal |
| logrotate-millo.conf | Log rotation; install to /etc/logrotate.d/millo |
| backup.cron | Backup cron entry; install to /etc/cron.d/millo-backup |
| backup-cron.sh | Daily backup script (MongoDB dump; set MONGO_URI, BACKUP_DIR) |
| env-loader.sh | Source .env before app |
| s3-binding.sh | S3 env vars instructions |
| .env.example | Template for .env |

---

## Order of operations

**Option A — Single script (recommended):**  
1. On Ubuntu 22.04: `cd /path/to/millo && sudo bash infra/install-all.sh` (or set `REPO_URL` to clone first, then re-run from clone).  
2. Edit `.env`, point DNS, run `infra/tls-letsencrypt.sh`, then reload PM2 if needed.

**Option B — Step by step:**  
1. Copy repo to server (e.g. /var/www/millo). Run `infra/install.sh` (root/sudo).
2. Point DNS for milloapp.com, api.milloapp.com, cdn.milloapp.com to server.
3. Run `infra/tls-letsencrypt.sh` (update email). Install cert-renewal.cron.
4. Copy .env.example to .env; fill MONGO_URI, etc. Optionally run env-loader.sh or rely on PM2 env_file.
5. Deploy app: `node scripts/deploy.js`. PM2 already started by install.sh; or `pm2 start infra/pm2.config.js`.
6. Place built web app in /var/www/millo/web; CDN assets in /var/www/millo/cdn or use S3.

---

## Validation

- `npm run validate:phase18` — Checks: all infra files exist (including logrotate-millo.conf, backup.cron, backup-cron.sh); nginx.conf contains ssl_certificate, ssl_certificate_key, letsencrypt, and milloapp.com / api / cdn; ufw.sh enables UFW; install.sh runs pm2 save and pm2 startup; provision scripts use systemctl enable.

---

## Domain

All bindings and configs use https://milloapp.com, api.milloapp.com, cdn.milloapp.com.
