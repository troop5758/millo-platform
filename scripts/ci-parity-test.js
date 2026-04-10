#!/usr/bin/env node
'use strict';
/**
 * Same sequence as .github/workflows CI test job: npm ci, then vitest run.
 * Use on Linux, macOS, WSL, or Windows with Developer Mode (workspace symlinks).
 * https://milloapp.com
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const shell = process.platform === 'win32';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cmd, args, label) {
  console.log(`[ci-parity] ${label}: ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell });
  const code = r.status ?? 1;
  if (code !== 0) {
    if (process.platform === 'win32' && label === 'npm ci') {
      console.error(
        '[ci-parity] If you see EISDIR on symlink, enable Windows Developer Mode (symlinks) or run this script under WSL/Linux.'
      );
    }
    process.exit(code);
  }
}

run(npmCmd, ['ci'], 'npm ci');
run(npmCmd, ['run', 'test'], 'npm run test');

console.log('[ci-parity] OK');
