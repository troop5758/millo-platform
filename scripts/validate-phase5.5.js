#!/usr/bin/env node
/**
 * Phase 5.5 validation: Policy gating verified.
 * Run from repo root.
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase5.5] Policy gating...');
try {
  execSync('node --test packages/milla/src/policyEngine.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase5.5] Policy gating tests failed');
  process.exit(1);
}
console.log('[validate-phase5.5] Policy gating verified. Validation passed.');
