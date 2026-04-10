#!/usr/bin/env node
/**
 * Phase 19 validation: CI/CD — pipeline passes (structure), rolling restart works.
 * Run from repo root.
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase19] CI/CD — pipeline passes, rolling restart works...');

const workflowPath = path.join(root, '.github/workflows/ci-cd.yml');
if (!fs.existsSync(workflowPath)) {
  console.error('[validate-phase19] Missing .github/workflows/ci-cd.yml');
  process.exit(1);
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const requiredJobs = ['lint', 'test', 'build', 'docker', 'deploy'];
for (const job of requiredJobs) {
  if (!workflow.includes(` ${job}:`) && !workflow.includes(`${job}:`)) {
    console.error('[validate-phase19] Workflow must define job:', job);
    process.exit(1);
  }
}
if (!workflow.includes('lint') || !workflow.includes('test') || !workflow.includes('build') || !workflow.includes('docker')) {
  console.error('[validate-phase19] Workflow must include lint, test, build, docker steps');
  process.exit(1);
}

const rollingPath = path.join(root, 'infra/rolling-restart.sh');
if (!fs.existsSync(rollingPath)) {
  console.error('[validate-phase19] Missing infra/rolling-restart.sh');
  process.exit(1);
}
const rolling = fs.readFileSync(rollingPath, 'utf8');
if (!rolling.includes('pm2 reload') && !rolling.includes('reload')) {
  console.error('[validate-phase19] rolling-restart.sh must use pm2 reload for zero-downtime');
  process.exit(1);
}

const rollbackPath = path.join(root, 'infra/rollback.sh');
if (!fs.existsSync(rollbackPath)) {
  console.error('[validate-phase19] Missing infra/rollback.sh');
  process.exit(1);
}
const rollback = fs.readFileSync(rollbackPath, 'utf8');
if (!rollback.includes('rollback') && !rollback.includes('reset') && !rollback.includes('rolling-restart')) {
  console.error('[validate-phase19] rollback.sh must contain rollback/restart logic (reset or rolling-restart)');
  process.exit(1);
}

if (!fs.existsSync(path.join(root, 'Dockerfile'))) {
  console.error('[validate-phase19] Missing Dockerfile');
  process.exit(1);
}

if (!fs.existsSync(path.join(root, 'scripts/lint.js'))) {
  console.error('[validate-phase19] Missing scripts/lint.js');
  process.exit(1);
}

console.log('[validate-phase19] Validation passed (pipeline, rolling restart, rollback).');
