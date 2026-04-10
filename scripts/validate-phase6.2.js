#!/usr/bin/env node
/**
 * Phase 6.2 validation: Billing accuracy tested, offline queue sync works.
 * Run from repo root. Billing tests run always; offline queue requires MongoDB.
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase6.2] Billing accuracy...');
try {
  execSync('node --test packages/dm-monetization/src/billing.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase6.2] Billing tests failed');
  process.exit(1);
}
console.log('[validate-phase6.2] Billing accuracy tested: OK');

console.log('[validate-phase6.2] Offline queue sync...');
try {
  execSync('node --test packages/dm-monetization/src/offlineQueue.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase6.2] Offline queue tests failed (is MongoDB running?)');
  process.exit(1);
}
console.log('[validate-phase6.2] Offline queue sync works: OK');
console.log('[validate-phase6.2] Validation passed.');
