#!/usr/bin/env node
'use strict';
/**
 * Monorepo install sanity — refreshes node_modules + lockfile from package.json.
 *
 * Workflow:
 *   - Local / after dep edits: `npm run install:verify` (or `npm install`)
 *   - Lockfile only (no full install): `npm run lockfile:sync`
 *   - CI / clean tree: `npm run install:ci` (`npm ci` — fails if lockfile ≠ package.json)
 *
 * Windows: workspace installs use symlinks; if `npm ci` fails with EISDIR, enable
 * Developer Mode (Settings → For developers) or run install/tests under WSL / CI (Linux).
 *
 * https://milloapp.com
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
process.chdir(root);

execSync('npm install --no-audit --no-fund', { stdio: 'inherit' });
console.log('[install-verify] Done. Commit package-lock.json if it changed.');
console.log('[install-verify] CI: use `npm run install:ci` on a clean checkout to verify lockfile match.');
