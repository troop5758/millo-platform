#!/usr/bin/env node
/**
 * Phase 6 validation: Live commerce (shopfront, ledger); no coin pack logic.
 * Run from repo root. Requires MongoDB for coins.test.js.
 */
const path = require('path');
const root = path.resolve(__dirname, '..');

// 1) Shopfront exists (no DB required)
const shopfront = require(path.join(root, 'packages', 'economy', 'src', 'shopfront.js'));
if (typeof shopfront.getShopfront !== 'function' || typeof shopfront.listItems !== 'function') {
  console.error('[validate-phase6] FAIL: Shopfront API (getShopfront, listItems) required');
  process.exit(1);
}
const sf = shopfront.getShopfront('creator1');
if (!sf || !Array.isArray(sf.items) || sf.creatorId !== 'creator1') {
  console.error('[validate-phase6] FAIL: getShopfront(creatorId) must return { creatorId, items }');
  process.exit(1);
}
console.log('[validate-phase6] Shopfront API: OK');

// 2) No coin pack logic: no purchaseCoins/buyCoins/etc. in economy src
const fs = require('fs');
const economySrc = path.join(root, 'packages', 'economy', 'src');
const forbidden = ['purchaseCoins', 'buyCoins', 'buyCoinPack', 'purchaseCoinPack'];
for (const f of fs.readdirSync(economySrc)) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(economySrc, f), 'utf8');
  for (const name of forbidden) {
    if (src.includes(name)) {
      console.error('[validate-phase6] FAIL: Phase 6 must NOT include coin pack logic; found', name, 'in', f);
      process.exit(1);
    }
  }
}
console.log('[validate-phase6] No coin pack API: OK');

// 3) Ledger + double-spend tests (requires MongoDB)
const { execSync } = require('child_process');
console.log('[validate-phase6] Economy tests (double-spend, immutable ledger)...');
try {
  execSync('node --test packages/economy/src/coins.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase6] Tests failed (is MongoDB running?)');
  process.exit(1);
}
console.log('[validate-phase6] Validation passed.');
