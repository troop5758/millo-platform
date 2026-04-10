#!/usr/bin/env node
/**
 * Phase 12 validation: Read-only enforced for TV clients.
 * Run from repo root.
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase12] TV — read-only enforced...');
try {
  execSync('node --test packages/tv/src/readOnly.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase12] Read-only tests failed.');
  process.exit(1);
}
console.log('[validate-phase12] Validation passed (read-only enforced).');
