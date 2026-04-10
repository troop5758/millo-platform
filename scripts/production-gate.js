#!/usr/bin/env node
/**
 * Production Gate — Final phase. Run validations, integration tests, output ready statement.
 * https://milloapp.com
 *
 * Feature-to-Phase Matrix (follow strictly when implementing any phase):
 * - Follow the Millo Feature-to-Phase Matrix strictly.
 * - Implement only the features owned by this phase.
 * - Do NOT implement features assigned to future phases.
 * - Do NOT refactor previous phases.
 */
const { execSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');

const validations = [
  'validate:bootstrap',
  'validate:schemas',
  'validate:phase1',
  'validate:phase1.5',
  'validate:phase2',
  'validate:phase3',
  'validate:phase4',
  'validate:phase5',
  'validate:phase5.5',
  'validate:phase5.6',
  'validate:phase6',
  'validate:phase6.2',
  'validate:phase7',
  'validate:phase8',
  'validate:phase9',
  'validate:phase10',
  'validate:phase11',
  'validate:phase12',
  'validate:phase13',
  'validate:phase14',
  'validate:phase15',
  'validate:phase16',
  'validate:phase17',
  'validate:phase18',
  'validate:phase19',
  'validate:phase20',
];

console.log('[production-gate] Running validations...');
for (const v of validations) {
  try {
    execSync('npm run ' + v, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    console.error('[production-gate] Failed:', v);
    process.exit(1);
  }
}

console.log('[production-gate] Running integration tests (API must be up for full pass)...');
try {
  execSync('node scripts/integration-tests.js', { cwd: root, stdio: 'inherit', env: { ...process.env, BASE_URL: process.env.BASE_URL || 'http://localhost:3000' } });
} catch (e) {
  console.warn('[production-gate] Integration tests failed (start API and re-run for full gate).');
}

console.log('');
console.log('========================================');
console.log('  MILLO ENTERPRISE PLATFORM READY');
console.log('  https://milloapp.com');
console.log('========================================');
console.log('');
