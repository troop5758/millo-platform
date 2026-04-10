#!/usr/bin/env node
/**
 * Phase 9 validation: No duplicate payouts, audit trail complete.
 * Run from repo root. Requires MongoDB.
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase9] Billing (no duplicate payouts, audit trail)...');
try {
  execSync('node --test packages/billing/src/billing.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase9] Tests failed (is MongoDB running?)');
  process.exit(1);
}
console.log('[validate-phase9] Validation passed.');
