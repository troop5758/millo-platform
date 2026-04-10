#!/usr/bin/env node
/**
 * Pre-flight environment validation — Millo platform.
 * Run before `npm start` or deployment to catch missing/invalid env vars early.
 * Exit 0 = all required vars present and valid.
 * Exit 1 = one or more critical vars missing (halts deployment).
 * Loads .env from repo root if present.
 * https://milloapp.com
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// Load .env from repo root
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '').trim();
      if (val) process.env[m[1]] = val;
    }
  }
}

const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const BOLD   = '\x1b[1m';

function ok(msg)   { console.log(`  ${GREEN}✓${RESET}  ${msg}`); }
function warn(msg) { console.warn(`  ${YELLOW}⚠${RESET}  ${msg}`); }
function fail(msg) { console.error(`  ${RED}✕${RESET}  ${msg}`); }

const env = process.env;

const REQUIRED = [
  { key: 'MONGODB_URI',       desc: 'MongoDB connection string',      example: 'mongodb+srv://user:pass@cluster.mongodb.net/millo' },
  { key: 'SESSION_SECRET',    desc: 'Session signing secret',         example: 'at-least-32-random-chars' },
  { key: 'JWT_SECRET',        desc: 'JWT signing secret',             example: 'at-least-32-random-chars' },
  { key: 'FRONTEND_URL',      desc: 'Public frontend URL',            example: 'https://milloapp.com' },
  { key: 'APP_URL',           desc: 'Public API / backend URL',       example: 'https://api.milloapp.com' },
  { key: 'CORS_ORIGIN',       desc: 'Allowed CORS origins',           example: 'https://milloapp.com' },
];

const OPTIONAL_WITH_WARNINGS = [
  // Payments
  { key: 'STRIPE_SECRET_KEY',         desc: 'Stripe secret key (payments will be unavailable)',     warnIfMissing: true },
  { key: 'STRIPE_WEBHOOK_SECRET',     desc: 'Stripe webhook secret (webhooks will be rejected)',    warnIfMissing: true },
  { key: 'STRIPE_PUBLISHABLE_KEY',    desc: 'Stripe publishable key (checkout UI will not work)',   warnIfMissing: false },
  // Email
  { key: 'SENDGRID_API_KEY',          desc: 'SendGrid API key (emails will be disabled)',           warnIfMissing: true },
  { key: 'SENDGRID_FROM_EMAIL',       desc: 'SendGrid sender address',                              warnIfMissing: false },
  // OAuth
  { key: 'OAUTH_GOOGLE_CLIENT_ID',    desc: 'Google OAuth client ID (Google login disabled)',       warnIfMissing: false },
  { key: 'OAUTH_GOOGLE_CLIENT_SECRET',desc: 'Google OAuth client secret (Google login disabled)',   warnIfMissing: false },
  { key: 'OAUTH_FACEBOOK_CLIENT_ID',  desc: 'Facebook OAuth client ID (Facebook login disabled)',   warnIfMissing: false },
  { key: 'OAUTH_FACEBOOK_CLIENT_SECRET', desc: 'Facebook OAuth client secret',                     warnIfMissing: false },
  { key: 'OAUTH_APPLE_CLIENT_ID',     desc: 'Apple OAuth client ID (Apple login disabled)',         warnIfMissing: false },
  { key: 'OAUTH_APPLE_TEAM_ID',       desc: 'Apple OAuth team ID',                                  warnIfMissing: false },
  { key: 'OAUTH_APPLE_KEY_ID',        desc: 'Apple OAuth key ID',                                   warnIfMissing: false },
  { key: 'OAUTH_APPLE_PRIVATE_KEY',   desc: 'Apple OAuth private key (base64 .p8)',                 warnIfMissing: false },
  // Live streaming
  { key: 'CLOUDFLARE_STREAM_TOKEN',   desc: 'Cloudflare Stream API token (live streaming limited)', warnIfMissing: true },
  { key: 'CLOUDFLARE_ACCOUNT_ID',     desc: 'Cloudflare account ID (live streaming limited)',       warnIfMissing: false },
  { key: 'RTMP_INGEST_HOST',          desc: 'RTMP ingest hostname (falls back to default)',         warnIfMissing: true },
  { key: 'HLS_HOST',                  desc: 'HLS playback hostname (falls back to default)',        warnIfMissing: true },
  // CDN / Storage
  { key: 'CDN_BASE_URL',              desc: 'CDN base URL for uploaded assets',                     warnIfMissing: true },
  { key: 'UPLOAD_BUCKET',             desc: 'S3/R2 upload bucket name',                             warnIfMissing: true },
  { key: 'AWS_ACCESS_KEY_ID',         desc: 'AWS / S3-compatible access key (uploads will fail)',   warnIfMissing: true },
  { key: 'AWS_SECRET_ACCESS_KEY',     desc: 'AWS / S3-compatible secret key (uploads will fail)',   warnIfMissing: true },
  { key: 'AWS_REGION',                desc: 'AWS region (uploads may fail)',                         warnIfMissing: false },
  // Security / rate-limiting
  { key: 'SECURE_COOKIES',            desc: 'Secure cookie flag — must be true in production',      warnIfMissing: true },
  { key: 'RATE_LIMIT_MAX',            desc: 'Global rate-limit request ceiling (default 100)',       warnIfMissing: false },
  { key: 'RATE_LIMIT_WINDOW_MS',      desc: 'Rate-limit window in milliseconds (default 60000)',     warnIfMissing: false },
  // AI
  { key: 'MILLA_API_KEY',             desc: 'Milla AI API key (AI shadow mode will stay off)',       warnIfMissing: false },
  { key: 'MILLA_ENABLED',             desc: 'Set to true to enable AI features',                     warnIfMissing: false },
  // Server
  { key: 'NODE_ENV',                  desc: 'Node environment (defaults to development)',             warnIfMissing: false },
  { key: 'PORT',                      desc: 'API server port (defaults to 3000)',                     warnIfMissing: false },
  { key: 'LOG_LEVEL',                 desc: 'Pino log level (defaults to info)',                      warnIfMissing: false },
  // Observability
  { key: 'SENTRY_DSN',                desc: 'Sentry DSN (errors will not be tracked)',                 warnIfMissing: true },
];

const SECURITY_CHECKS = [
  {
    key: 'SESSION_SECRET',
    label: 'SESSION_SECRET length',
    check: (v) => v && v.length >= 32,
    message: 'SESSION_SECRET must be at least 32 characters long.',
  },
  {
    key: 'JWT_SECRET',
    label: 'JWT_SECRET length',
    check: (v) => v && v.length >= 32,
    message: 'JWT_SECRET must be at least 32 characters long.',
  },
  {
    key: 'FRONTEND_URL',
    label: 'FRONTEND_URL scheme',
    check: (v) => !v || env.NODE_ENV !== 'production' || v.startsWith('https://'),
    message: 'In production, FRONTEND_URL must use HTTPS.',
  },
  {
    key: 'CORS_ORIGIN',
    label: 'CORS_ORIGIN scheme',
    check: (v) => !v || env.NODE_ENV !== 'production' || v.split(',').every((o) => o.trim().startsWith('https://')),
    message: 'In production, all CORS_ORIGIN values must use HTTPS.',
  },
  {
    key: 'MONGODB_URI',
    label: 'MONGODB_URI scheme',
    check: (v) => !v || v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'),
    message: 'MONGODB_URI must start with mongodb:// or mongodb+srv://',
  },
  {
    key: 'APP_URL',
    label: 'APP_URL scheme',
    check: (v) => !v || env.NODE_ENV !== 'production' || v.startsWith('https://'),
    message: 'In production, APP_URL must use HTTPS.',
  },
  {
    key: 'SECURE_COOKIES',
    label: 'SECURE_COOKIES in production',
    check: (v) => !v || env.NODE_ENV !== 'production' || v === 'true',
    message: 'In production, SECURE_COOKIES must be set to "true".',
  },
  {
    key: 'RATE_LIMIT_MAX',
    label: 'RATE_LIMIT_MAX is a positive integer',
    check: (v) => !v || (Number.isInteger(Number(v)) && Number(v) > 0),
    message: 'RATE_LIMIT_MAX must be a positive integer (e.g. 100).',
  },
];

function run() {
  const isProduction = env.NODE_ENV === 'production';
  const label = isProduction ? 'PRODUCTION' : (env.NODE_ENV || 'development').toUpperCase();

  console.log(`\n${BOLD}Millo pre-flight env check — ${label}${RESET}\n`);

  let criticalErrors = 0;
  let warnings       = 0;

  // ── Required vars
  console.log(`${BOLD}Required variables:${RESET}`);
  for (const { key, desc, example } of REQUIRED) {
    if (env[key]) {
      ok(`${key} — ${desc}`);
    } else {
      fail(`${key} is missing — ${desc}`);
      if (example) console.error(`         Example: ${key}=${example}`);
      criticalErrors++;
    }
  }

  // ── Optional / conditional vars
  console.log(`\n${BOLD}Optional variables:${RESET}`);
  for (const { key, desc, warnIfMissing } of OPTIONAL_WITH_WARNINGS) {
    if (env[key]) {
      ok(`${key} — set`);
    } else if (warnIfMissing) {
      warn(`${key} not set — ${desc}`);
      warnings++;
    } else {
      warn(`${key} not set — ${desc} (optional)`);
    }
  }

  // ── Security checks
  console.log(`\n${BOLD}Security checks:${RESET}`);
  for (const { key, label: lbl, check, message } of SECURITY_CHECKS) {
    const value = env[key];
    if (!value) continue; // already reported as missing above if required
    if (check(value)) {
      ok(lbl);
    } else {
      fail(`${lbl} — ${message}`);
      criticalErrors++;
    }
  }

  // ── Summary
  console.log(`\n${BOLD}Summary:${RESET}`);
  if (criticalErrors === 0 && warnings === 0) {
    console.log(`  ${GREEN}${BOLD}All checks passed. Ready to deploy.${RESET}\n`);
    process.exit(0);
  } else if (criticalErrors === 0) {
    console.log(`  ${YELLOW}${BOLD}${warnings} warning(s). Review before deploying to production.${RESET}\n`);
    process.exit(0);
  } else {
    console.error(`  ${RED}${BOLD}${criticalErrors} critical error(s). Fix before deploying.${RESET}\n`);
    process.exit(1);
  }
}

run();
