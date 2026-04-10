#!/usr/bin/env node
/**
 * Validate Final Phase - Production Gate. Ensures all deliverables exist.
 * https://milloapp.com
 *
 * Feature-to-Phase Matrix (follow strictly when implementing any phase):
 * - Follow the Millo Feature-to-Phase Matrix strictly.
 * - Implement only the features owned by this phase.
 * - Do NOT implement features assigned to future phases.
 * - Do NOT refactor previous phases.
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const required = [
  'scripts/integration-tests.js',
  'scripts/load-test.js',
  'scripts/production-gate.js',
  'docs/security-checklist.md',
  'docs/launch-checklist.md',
  'docs/FINAL-PHASE-PRODUCTION-GATE.md',
];

let failed = 0;
for (const file of required) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) {
    console.error('Missing:', file);
    failed++;
  }
}
if (failed) {
  console.error('[validate-final-phase]', failed, 'missing files');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
if (!scripts['integration-tests'] || !scripts['load-test'] || !scripts['production-gate']) {
  console.error('[validate-final-phase] package.json missing integration-tests, load-test, or production-gate script');
  process.exit(1);
}

console.log('[validate-final-phase] All production gate deliverables present (integration tests, load tests, security checklist, launch checklist).');
console.log('MILLO ENTERPRISE PLATFORM READY - https://milloapp.com');
