#!/usr/bin/env node
'use strict';
/**
 * Go-Live Gate (focused) — fast production-readiness checks for Option B wiring.
 * Runs a targeted subset of validators and prints a concise report.
 * https://milloapp.com
 */

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

/** Ordered for fast fail on missing deps and core schema/security regressions. */
const CHECKS = [
  { id: 'install-verify', cmd: 'npm', args: ['run', 'install:verify'] },
  { id: 'validate-schemas', cmd: 'npm', args: ['run', 'validate:schemas'] },
  { id: 'validate-phase9', cmd: 'npm', args: ['run', 'validate:phase9'] },
  { id: 'validate-phase20', cmd: 'npm', args: ['run', 'validate:phase20'] },
];

function runOne(check) {
  process.stdout.write(`\n[go-live-gate] ${check.id} ...\n`);
  const out = spawnSync(check.cmd, check.args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const ok = (out.status || 0) === 0;
  return { id: check.id, ok, code: out.status || 0 };
}

function main() {
  process.stdout.write('[go-live-gate] Starting focused production checks\n');
  process.stdout.write(`[go-live-gate] Repo: ${root}\n`);

  const results = [];
  for (const c of CHECKS) {
    const r = runOne(c);
    results.push(r);
    if (!r.ok) break;
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.find((r) => !r.ok) || null;

  process.stdout.write('\n----------------------------------------\n');
  process.stdout.write('[go-live-gate] Summary\n');
  for (const r of results) {
    process.stdout.write(` - ${r.ok ? 'PASS' : 'FAIL'} ${r.id} (exit=${r.code})\n`);
  }
  process.stdout.write(` - Passed: ${passed}/${CHECKS.length}\n`);

  if (failed) {
    process.stdout.write(` - Result: NOT READY (first failure: ${failed.id})\n`);
    process.stdout.write(' - Hint: run `npm install` if dependency-related, then re-run this gate.\n');
    process.stdout.write('----------------------------------------\n');
    process.exit(1);
  }

  process.stdout.write(' - Result: READY FOR GO-LIVE GATE (focused)\n');
  process.stdout.write(' - Optional full sweep: `npm run production-gate`\n');
  process.stdout.write('----------------------------------------\n');
}

main();

