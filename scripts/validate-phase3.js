#!/usr/bin/env node
/**
 * Phase 3 validation: unit tests pass, gating enforced.
 * Run from repo root: node scripts/validate-phase3.js
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase3] Unit tests...');
try {
  execSync('npm run test:level-trust', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase3] Unit tests failed');
  process.exit(1);
}
console.log('[validate-phase3] Unit tests pass: OK');

console.log('[validate-phase3] Gating: POST /gated enforces requireLevel/requireTrust (see docs/phase-3-level-trust-engine.md).');
console.log('[validate-phase3] Validation passed.');
