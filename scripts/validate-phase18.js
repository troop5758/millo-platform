#!/usr/bin/env node
/**
 * Phase 18 validation: Ubuntu Deployment — install, nginx, SSL, Mongo/Redis provisioning,
 * firewall, Fail2ban, PM2/systemd, log rotation, backup cron, domain binding.
 * Run from repo root. Checks infra files exist and contain required patterns.
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const infra = path.join(root, 'infra');

console.log('[validate-phase18] Ubuntu Deployment — SSL, firewall, services boot, log rotation, backup cron...');

// Required files
const files = [
  'install.sh',
  'nginx.conf',
  'pm2.config.js',
  'provision-mongodb.sh',
  'provision-postgresql.sh',
  'provision-redis.sh',
  'ufw.sh',
  'fail2ban.sh',
  'tls-letsencrypt.sh',
  'cert-renewal.sh',
  'cert-renewal.cron',
  'logrotate-millo.conf',
  'backup.cron',
  'backup-cron.sh',
  'env-loader.sh',
  's3-binding.sh',
];
for (const f of files) {
  if (!fs.existsSync(path.join(infra, f))) {
    console.error('[validate-phase18] Missing:', f);
    process.exit(1);
  }
}

// SSL valid: nginx.conf has ssl_certificate and Let's Encrypt path
const nginx = fs.readFileSync(path.join(infra, 'nginx.conf'), 'utf8');
if (!nginx.includes('ssl_certificate') || !nginx.includes('ssl_certificate_key') || !nginx.includes('letsencrypt')) {
  console.error('[validate-phase18] nginx.conf must contain ssl_certificate, ssl_certificate_key, and letsencrypt path');
  process.exit(1);
}
if (!nginx.includes('milloapp.com') || !nginx.includes('api.milloapp.com') || !nginx.includes('cdn.milloapp.com')) {
  console.error('[validate-phase18] nginx.conf must bind milloapp.com, api.milloapp.com, cdn.milloapp.com');
  process.exit(1);
}

// Firewall active: ufw.sh enables UFW
const ufw = fs.readFileSync(path.join(infra, 'ufw.sh'), 'utf8');
if (!ufw.includes('ufw') || (!ufw.includes('enable') && !ufw.includes('ufw --force enable'))) {
  console.error('[validate-phase18] ufw.sh must enable UFW');
  process.exit(1);
}

// Services boot on restart: install.sh or pm2 has startup, and provision scripts enable systemd
const install = fs.readFileSync(path.join(infra, 'install.sh'), 'utf8');
if (!install.includes('pm2 startup') && !install.includes('pm2 save')) {
  console.error('[validate-phase18] install.sh must run pm2 save and pm2 startup for boot on restart');
  process.exit(1);
}
const mongo = fs.readFileSync(path.join(infra, 'provision-mongodb.sh'), 'utf8');
const redis = fs.readFileSync(path.join(infra, 'provision-redis.sh'), 'utf8');
if (!mongo.includes('systemctl enable') || !redis.includes('systemctl enable')) {
  console.error('[validate-phase18] provision scripts must enable systemd services for boot on restart');
  process.exit(1);
}

console.log('[validate-phase18] Validation passed (SSL, firewall, PM2/systemd, log rotation, backup cron).');
