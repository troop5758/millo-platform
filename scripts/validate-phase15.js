#!/usr/bin/env node
/**
 * Phase 15 validation: Live commerce (shopfront, ledger); no coin pack logic.
 * Run from repo root. Requires MongoDB. Checks docs/phase-15-commerce.md.
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

if (!fs.existsSync(path.join(root, 'docs/phase-15-commerce.md'))) {
  console.error('[validate-phase15] Missing docs/phase-15-commerce.md');
  process.exit(1);
}

const { execSync } = require('child_process');

console.log('[validate-phase15] Commerce — shopfront, ledger, no coin pack...');
// Shopfront API
const shopfront = require(path.join(root, 'packages', 'economy', 'src', 'shopfront.js'));
if (typeof shopfront.getShopfront !== 'function' || typeof shopfront.listItems !== 'function') {
  console.error('[validate-phase15] FAIL: Shopfront API required');
  process.exit(1);
}
console.log('[validate-phase15] Shopfront API: OK');

// Economy tests (double-spend, ledger)
try {
  execSync('node --test packages/economy/src/coins.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase15] Economy tests failed (is MongoDB running?)');
  process.exit(1);
}
console.log('[validate-phase15] Validation passed.');
