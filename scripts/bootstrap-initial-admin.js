#!/usr/bin/env node
'use strict';
/**
 * One-time bootstrap: create temporary Millo administrator if none exists.
 * Generates random password when INITIAL_ADMIN_PASSWORD is unset; prints credentials (aaPanel-style).
 *
 * Run from repo root after MongoDB is up and npm install:
 *   node scripts/bootstrap-initial-admin.js
 *
 * Env (optional):
 *   INITIAL_ADMIN_EMAIL   default: admin@${MILLO_DOMAIN or milloapp.com}
 *   INITIAL_ADMIN_PASSWORD if set, used instead of random (min 8 chars)
 *   MONGODB_URI            default from .env
 *   MILLO_CREDENTIALS_FILE  if set, write credentials there (mode 0600); default on Linux: /root/.millo-install-credentials.txt when root
 *
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '').trim();
      if (val && process.env[m[1]] === undefined) process.env[m[1]] = val;
    }
  }
}

function randomPassword() {
  return crypto.randomBytes(18).toString('base64url');
}

function printBanner(lines) {
  const w = Math.max(...lines.map((l) => l.length), 60);
  const bar = '='.repeat(w + 4);
  console.log('\n' + bar);
  for (const line of lines) {
    console.log(`|| ${line.padEnd(w)} ||`);
  }
  console.log(bar + '\n');
}

async function main() {
  process.chdir(ROOT);
  loadEnvFile();

  const domain = (process.env.MILLO_DOMAIN || 'milloapp.com').replace(/^https?:\/\//, '').split('/')[0];
  const defaultEmail = `admin@${domain}`;

  let email = (process.env.INITIAL_ADMIN_EMAIL || defaultEmail).trim().toLowerCase();
  let password = (process.env.INITIAL_ADMIN_PASSWORD || '').trim();
  let generated = false;

  if (!password) {
    password = randomPassword();
    generated = true;
  }

  process.env.INITIAL_ADMIN_EMAIL = email;
  process.env.INITIAL_ADMIN_PASSWORD = password;

  const db = require('@millo/database');
  const mongoose = require('mongoose');
  const { ensureInitialAdmin } = require(path.join(ROOT, 'packages/api/src/bootstrap/initialAdmin'));

  await db.connect(process.env.MONGODB_URI);
  const result = await ensureInitialAdmin(console);

  if (!result.created) {
    if (result.reason === 'admin_exists') {
      console.log('[bootstrap-initial-admin] An admin user already exists — skipped.');
    } else if (result.reason === 'email_taken') {
      console.warn('[bootstrap-initial-admin] Email already registered — skipped.');
    } else if (result.reason === 'password_short') {
      process.exitCode = 1;
    } else {
      console.log('[bootstrap-initial-admin] No admin created:', result.reason || 'unknown');
    }
    await mongoose.connection.close().catch(() => {});
    return;
  }

  const loginUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/login`
    : `https://${domain}/login`;

  const lines = [
    'MILLO — TEMPORARY ADMINISTRATOR (change password immediately)',
    '',
    `Login URL: ${loginUrl}`,
    `Email:     ${email}`,
    `Password:  ${password}`,
    '',
    generated
      ? 'Password was randomly generated for this install.'
      : 'Password was taken from INITIAL_ADMIN_PASSWORD.',
    'Remove INITIAL_ADMIN_PASSWORD from .env after first login if you set it.',
    'Delete any credentials file after copying to a password manager.',
  ];

  printBanner(lines);

  let credFile = process.env.MILLO_CREDENTIALS_FILE;
  if (!credFile && process.platform !== 'win32' && process.getuid && process.getuid() === 0) {
    credFile = '/root/.millo-install-credentials.txt';
  }
  if (credFile) {
    try {
      const body = [
        `Millo temporary administrator`,
        `Created: ${new Date().toISOString()}`,
        `Login: ${loginUrl}`,
        `Email: ${email}`,
        `Password: ${password}`,
        '',
        'Change this password immediately after first login.',
      ].join('\n');
      fs.writeFileSync(credFile, body, { mode: 0o600, flag: 'w' });
      try {
        fs.chmodSync(credFile, 0o600);
      } catch (_) { /* ignore */ }
      console.log(`[bootstrap-initial-admin] Credentials also written to: ${credFile} (chmod 600)`);
    } catch (e) {
      console.warn('[bootstrap-initial-admin] Could not write credentials file:', e.message);
    }
  }

  await mongoose.connection.close().catch(() => {});
}

main().catch((e) => {
  console.error('[bootstrap-initial-admin]', e);
  process.exit(1);
});
