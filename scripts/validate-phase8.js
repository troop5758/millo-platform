#!/usr/bin/env node
/**
 * Phase 8 validation: Kill-switch halts delivery.
 * Run from repo root.
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase8] Ads engine (kill-switch halts delivery)...');
try {
  execSync('node --test packages/ads/src/delivery.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase8] Tests failed');
  process.exit(1);
}
console.log('[validate-phase8] Validation passed.');
