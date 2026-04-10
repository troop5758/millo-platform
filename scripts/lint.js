#!/usr/bin/env node
/**
 * Lint — CI check. Node version, bootstrap validation, optional schema check.
 * https://milloapp.com
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeMajor < 18) {
  console.error('[lint] Node 18+ required');
  process.exit(1);
}

try {
  execSync('node scripts/validate-bootstrap.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  process.exit(1);
}
console.log('[lint] Passed.');
