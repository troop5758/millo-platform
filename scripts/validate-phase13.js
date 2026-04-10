#!/usr/bin/env node
/**
 * Phase 13 validation: AI optimization shadow mode — no auto-application.
 * Run from repo root.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase13] AI optimization — no auto-application...');

// 1) Run tests (suggestions have applied: false, kill-switch, explainability)
try {
  execSync(
    'node --test packages/ai-optimization/src/config.test.js packages/ai-optimization/src/noAutoApplication.test.js packages/ai-optimization/src/adsDeliveryOptimizer.test.js packages/ai-optimization/src/rankingOptimizer.bump.test.js',
    {
      cwd: root,
      stdio: 'inherit',
    }
  );
} catch (e) {
  console.error('[validate-phase13] Tests failed.');
  process.exit(1);
}

// 2) No auto-application: package must not call discovery.rank or ads.runAuction/deliver
const pkgDir = path.join(root, 'packages/ai-optimization');
const files = [
  'src/rankingOptimizer.js',
  'src/bidOptimizer.js',
  'src/index.js',
  'src/config.js',
  'src/shadowLog.js',
  'src/adsDeliveryOptimizer.js',
];
const forbidden = ['.rank(', 'runAuction(', '.deliver(', "require('@millo/discovery')", "require('@millo/ads')"];
for (const f of files) {
  const content = fs.readFileSync(path.join(pkgDir, f), 'utf8');
  for (const token of forbidden) {
    if (content.includes(token)) {
      console.error('[validate-phase13] No auto-application violated: found', token, 'in', f);
      process.exit(1);
    }
  }
}

console.log('[validate-phase13] Validation passed (no auto-application).');
