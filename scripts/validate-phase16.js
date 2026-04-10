#!/usr/bin/env node
/**
 * Phase 16 validation: AI optimization shadow mode — no auto-application.
 * Run from repo root. Checks docs/phase-16-ai.md.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.resolve(__dirname, '..');

if (!fs.existsSync(path.join(root, 'docs/phase-16-ai.md'))) {
  console.error('[validate-phase16] Missing docs/phase-16-ai.md');
  process.exit(1);
}

console.log('[validate-phase16] AI optimization — no auto-application...');

// Run AI optimization tests
try {
  execSync(
    'node --test packages/ai-optimization/src/config.test.js packages/ai-optimization/src/noAutoApplication.test.js packages/ai-optimization/src/adsDeliveryOptimizer.test.js packages/ai-optimization/src/rankingOptimizer.bump.test.js',
    {
      cwd: root,
      stdio: 'inherit',
    }
  );
} catch (e) {
  console.error('[validate-phase16] AI optimization tests failed.');
  process.exit(1);
}

// No auto-application: package must not call discovery.rank or ads.runAuction/deliver
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
  if (!fs.existsSync(path.join(pkgDir, f))) continue;
  const content = fs.readFileSync(path.join(pkgDir, f), 'utf8');
  for (const token of forbidden) {
    if (content.includes(token)) {
      console.error('[validate-phase16] No auto-application violated: found', token, 'in', f);
      process.exit(1);
    }
  }
}

console.log('[validate-phase16] Validation passed (no auto-application).');
