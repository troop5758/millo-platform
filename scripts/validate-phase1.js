#!/usr/bin/env node
/**
 * Phase 1 — Core Foundation validation. No business logic, no economy, no live.
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const required = [
  'packages/shared/src/logger.js',
  'packages/shared/src/featureFlags.js',
  'packages/shared/src/killSwitch.js',
  'packages/shared/src/rbac.js',
  'packages/shared/src/envLoader.js',
  'packages/shared/src/config.js',
  'packages/shared/index.js',
  'packages/api/src/middleware/authShell.js',
];

let failed = 0;
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) {
    console.error('Missing:', file);
    failed++;
  }
}

const shared = require(path.join(root, 'packages/shared/index.js'));
if (!shared.logger || !shared.logger.info) {
  console.error('Shared logger missing or invalid');
  failed++;
}
if (!shared.featureFlags || typeof shared.featureFlags.isEnabled !== 'function') {
  console.error('Shared featureFlags.isEnabled missing');
  failed++;
}
if (!shared.killSwitch || typeof shared.killSwitch.isEnabled !== 'function') {
  console.error('Shared killSwitch.isEnabled missing');
  failed++;
}
if (!shared.rbac || !shared.rbac.ROLES || typeof shared.rbac.hasRole !== 'function') {
  console.error('Shared rbac.ROLES or hasRole missing');
  failed++;
}
if (!shared.envLoader || typeof shared.envLoader.loadEnv !== 'function') {
  console.error('Shared envLoader.loadEnv missing');
  failed++;
}
if (!shared.config || typeof shared.config.bind !== 'function') {
  console.error('Shared config.bind missing');
  failed++;
}

const authShell = require(path.join(root, 'packages/api/src/middleware/authShell.js'));
if (!authShell.createAuthMiddleware || typeof authShell.createAuthMiddleware !== 'function') {
  console.error('Auth middleware shell createAuthMiddleware missing');
  failed++;
}

if (failed) {
  console.error('[validate-phase1]', failed, 'check(s) failed');
  process.exit(1);
}
console.log('[validate-phase1] Core foundation OK');
