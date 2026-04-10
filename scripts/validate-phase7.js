#!/usr/bin/env node
/**
 * Phase 7 validation: Shadow ban respected.
 * Run from repo root.
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase7] Discovery engine (shadow ban respected)...');
try {
  execSync('node --test packages/discovery/src/ranking.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase7] Tests failed');
  process.exit(1);
}
console.log('[validate-phase7] Validation passed.');
