#!/usr/bin/env node
/**
 * Phase 5.6 validation: Force mute works, kill-switch works.
 * Run from repo root.
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase5.6] Force mute & kill-switch...');
try {
  execSync('node --test packages/milla/src/liveIntegration.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase5.6] Tests failed');
  process.exit(1);
}
console.log('[validate-phase5.6] Validation passed.');
