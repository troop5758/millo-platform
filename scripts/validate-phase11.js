#!/usr/bin/env node
/**
 * Phase 11 validation: DSAR export works.
 * Run from repo root. Requires npm install; MongoDB optional for full export.
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase11] Compliance — DSAR export...');
try {
  execSync('node --test packages/compliance/src/dsar.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase11] DSAR test failed.');
  process.exit(1);
}
console.log('[validate-phase11] Validation passed (DSAR export works).');
