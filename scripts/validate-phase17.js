#!/usr/bin/env node
/**
 * Phase 17 validation: Self-observation — recommendations visible, no auto-changes.
 * Run from repo root.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase17] Self-observation — recommendations visible, no auto-changes...');

// 1) Recommendations visible
try {
  execSync('node --test packages/self-observation/src/recommendations.test.js', {
    cwd: root,
    stdio: 'inherit',
  });
} catch (e) {
  console.error('[validate-phase17] Recommendations tests failed.');
  process.exit(1);
}

// 2) No auto-changes: package must not exec npm, write config, or apply changes
const pkgDir = path.join(root, 'packages/self-observation');
const files = ['src/driftDetection.js', 'src/upgradeAdvisor.js', 'src/healthDashboards.js', 'src/securityAlerts.js', 'src/index.js'];
const forbidden = [
  "execSync('npm",
  "exec('npm",
  "spawnSync('npm",
  'writeFileSync',
  'writeFile(',
  'fs.write',
  'child_process.exec',
  'npm install',
  'npm run ',
  'npm ci',
];
for (const f of files) {
  const full = path.join(pkgDir, f);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  for (const token of forbidden) {
    if (content.includes(token)) {
      console.error('[validate-phase17] No auto-changes violated: found', token, 'in', f);
      process.exit(1);
    }
  }
}

console.log('[validate-phase17] Validation passed (recommendations visible, no auto-changes).');
