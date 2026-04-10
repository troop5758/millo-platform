#!/usr/bin/env node
/**
 * Millo 3.0 — deployment script
 * Full deployability via script. Bind: https://milloapp.com
 * Run from repo root: node scripts/deploy.js [--skip-health-check]
 *
 * Steps:
 *   1. Pre-flight env validation
 *   2. Install dependencies
 *   3. Build all workspaces
 *   4. PM2 restart (zero-downtime process reload)
 *   5. Post-deploy health check (HTTP /health → 200)
 *   6. Automatic rollback on failure (restores previous build + restarts PM2 from backup)
 */
'use strict';
const { execSync, spawnSync } = require('child_process');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');

const ROOT   = path.resolve(__dirname, '..');
const DOMAIN = process.env.APP_URL || 'https://milloapp.com';
const API    = process.env.API_URL  || `${DOMAIN}/api`;
const ARGS         = process.argv.slice(2);
const SKIP_HEALTH  = ARGS.includes('--skip-health-check');
const SKIP_PM2     = ARGS.includes('--skip-pm2');
const PM2_APP_NAME = process.env.PM2_APP_NAME || 'millo-api';
const DISABLE_ROOT_LOGIN = process.env.DISABLE_ROOT_LOGIN === 'true';

function resolveBuildMetadata() {
  const pkgPath = path.join(ROOT, 'package.json');
  let appVersion = process.env.APP_VERSION || '3.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg?.version) appVersion = String(pkg.version);
  } catch {}

  let gitCommit = process.env.GIT_COMMIT || 'unknown';
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || gitCommit;
  } catch {}

  const buildDate = process.env.BUILD_DATE || new Date().toISOString();
  return { appVersion, gitCommit, buildDate };
}

// ── Colours ─────────────────────────────────────────────────────────────────
const R  = '\x1b[31m', Y = '\x1b[33m', G = '\x1b[32m', B = '\x1b[34m', E = '\x1b[0m';
const log  = (m) => console.log(`${B}[deploy]${E} ${m}`);
const ok   = (m) => console.log(`${G}[deploy ✓]${E} ${m}`);
const warn = (m) => console.warn(`${Y}[deploy ⚠]${E} ${m}`);
const fail = (m) => console.error(`${R}[deploy ✕]${E} ${m}`);

// ── Backup / rollback helpers ────────────────────────────────────────────────
const BACKUP_DIR = path.join(ROOT, '.deploy-backup');

/**
 * Cross-platform recursive directory copy using Node's built-in fs.cpSync
 * (available since Node 16.7). No external tools required — works on Linux,
 * macOS, and Windows without robocopy or cp -r.
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function backupCurrentBuild() {
  const buildDirs = [
    path.join(ROOT, 'packages', 'web',    'dist'),
    path.join(ROOT, 'packages', 'api',    'dist'),
    path.join(ROOT, 'packages', 'mobile', 'dist'),
  ].filter(fs.existsSync);

  if (!buildDirs.length) {
    log('No existing build artefacts to back up — first deploy.');
    return false;
  }

  if (fs.existsSync(BACKUP_DIR)) {
    fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  for (const dir of buildDirs) {
    const rel  = path.relative(ROOT, dir);
    const dest = path.join(BACKUP_DIR, rel);
    copyDir(dir, dest);
  }
  ok(`Backed up ${buildDirs.length} build director${buildDirs.length > 1 ? 'ies' : 'y'} → .deploy-backup/`);
  return true;
}

function rollback() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fail('No backup found — cannot roll back.');
    return;
  }
  warn('Rolling back to previous build…');
  const entries = fs.readdirSync(BACKUP_DIR);
  for (const entry of entries) {
    const src  = path.join(BACKUP_DIR, entry);
    const dest = path.join(ROOT, entry);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    copyDir(src, dest);
  }
  ok('Rollback complete — previous build restored.');
}

// ── PM2 restart ──────────────────────────────────────────────────────────────
function pm2Reload() {
  // Try `reload` (zero-downtime) first; fall back to `restart` if app isn't in cluster mode.
  const reloadResult = spawnSync('pm2', ['reload', PM2_APP_NAME, '--update-env'], { stdio: 'inherit', shell: true });
  if (reloadResult.status === 0) {
    ok(`PM2 reloaded process '${PM2_APP_NAME}'.`);
    return true;
  }
  warn(`pm2 reload exited ${reloadResult.status} — falling back to pm2 restart.`);
  const restartResult = spawnSync('pm2', ['restart', PM2_APP_NAME, '--update-env'], { stdio: 'inherit', shell: true });
  if (restartResult.status === 0) {
    ok(`PM2 restarted process '${PM2_APP_NAME}'.`);
    return true;
  }
  warn(`pm2 restart exited ${restartResult.status} — process '${PM2_APP_NAME}' may not be running yet (first deploy?). Attempting pm2 start via ecosystem file.`);
  const ecoFile = path.join(ROOT, 'ecosystem.config.js');
  if (fs.existsSync(ecoFile)) {
    const startResult = spawnSync('pm2', ['start', ecoFile, '--env', 'production'], { stdio: 'inherit', shell: true });
    if (startResult.status === 0) {
      ok('PM2 started from ecosystem.config.js.');
      spawnSync('pm2', ['save'], { stdio: 'pipe', shell: true });
      return true;
    }
  }
  fail('Could not reload, restart, or start PM2. The new code is built but the process is still running the old version.');
  return false;
}

function runInfraHardening() {
  if (!DISABLE_ROOT_LOGIN) {
    log('Infra hardening: DISABLE_ROOT_LOGIN=false (skipped).');
    return true;
  }
  if (process.platform === 'win32') {
    warn('Infra hardening: root-login disable skipped on Windows.');
    return true;
  }
  const script = path.join(ROOT, 'scripts', 'security', 'disable-root.sh');
  if (!fs.existsSync(script)) {
    warn('Infra hardening script missing: scripts/security/disable-root.sh');
    return false;
  }
  log('Applying infra hardening: Disable root SSH login (PermitRootLogin no)…');
  const result = spawnSync('bash', [script], { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    fail(`Infra hardening failed (exit ${result.status}).`);
    return false;
  }
  ok('Infra hardening applied: root SSH login disabled.');
  return true;
}

// ── Health check ─────────────────────────────────────────────────────────────
const HEALTH_CHECK_URL     = `${API}/health`.replace(/([^:])\/\//g, '$1/');
const HEALTH_CHECK_TIMEOUT = 15_000;   // ms per attempt
const HEALTH_CHECK_RETRIES = 5;
const HEALTH_CHECK_DELAY   = 3_000;    // ms between retries

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function httpGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const mod  = url.startsWith('https') ? https : http;
    const req  = mod.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end',  ()  => resolve({ status: res.statusCode, body }));
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

async function healthCheck() {
  log(`Running health check against: ${HEALTH_CHECK_URL}`);
  for (let attempt = 1; attempt <= HEALTH_CHECK_RETRIES; attempt++) {
    try {
      const { status } = await httpGet(HEALTH_CHECK_URL, HEALTH_CHECK_TIMEOUT);
      if (status === 200) {
        ok(`Health check passed (attempt ${attempt}/${HEALTH_CHECK_RETRIES}).`);
        return true;
      }
      warn(`Health check returned HTTP ${status} (attempt ${attempt}/${HEALTH_CHECK_RETRIES}).`);
    } catch (e) {
      warn(`Health check failed: ${e.message} (attempt ${attempt}/${HEALTH_CHECK_RETRIES}).`);
    }
    if (attempt < HEALTH_CHECK_RETRIES) {
      log(`Retrying in ${HEALTH_CHECK_DELAY / 1000}s…`);
      await sleep(HEALTH_CHECK_DELAY);
    }
  }
  return false;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  log('Millo 3.0 — deploy script');
  log(`Domain : ${DOMAIN}`);
  log(`API    : ${API}`);
  log(`Root   : ${ROOT}`);

  // Phase 10: build metadata for runtime health endpoint
  const meta = resolveBuildMetadata();
  process.env.APP_VERSION = meta.appVersion;
  process.env.GIT_COMMIT = meta.gitCommit;
  process.env.BUILD_DATE = meta.buildDate;
  log(`Build  : APP_VERSION=${meta.appVersion} GIT_COMMIT=${meta.gitCommit} BUILD_DATE=${meta.buildDate}`);

  process.chdir(ROOT);

  // Step 1 — env validation
  log('Step 1/5 — Pre-flight environment validation…');
  const envResult = spawnSync('node', ['scripts/env-validate.js'], { stdio: 'inherit' });
  if (envResult.status !== 0) {
    fail('Environment validation failed. Fix missing/invalid env vars before deploying.');
    process.exit(1);
  }
  ok('Environment validation passed.');

  // Step 2 — backup existing build
  log('Step 2/5 — Backing up current build…');
  const hadBackup = backupCurrentBuild();

  // Step 3 — install + build
  log('Step 3/5 — Installing dependencies and building…');
  try {
    try {
      execSync('npm ci', { stdio: 'inherit' });
    } catch {
      warn('npm ci failed — falling back to npm install.');
      execSync('npm install', { stdio: 'inherit' });
    }
    execSync('npm run build', { stdio: 'inherit' });
    ok('Build complete.');
  } catch (buildErr) {
    fail(`Build failed: ${buildErr.message}`);
    if (hadBackup) {
      warn('Build error — attempting rollback…');
      rollback();
    }
    process.exit(1);
  }

  // Step 4 — Infra hardening (optional) + PM2 restart
  const hardeningOk = runInfraHardening();
  if (!hardeningOk) {
    fail('Stopping deploy due to infra hardening failure.');
    if (hadBackup) rollback();
    process.exit(1);
  }

  if (SKIP_PM2) {
    warn('--skip-pm2 flag set — skipping PM2 restart. New code will not be active until PM2 is reloaded manually.');
  } else {
    log(`Step 4/5 — Reloading PM2 process '${PM2_APP_NAME}'…`);
    const pm2Ok = pm2Reload();
    if (!pm2Ok) {
      fail('PM2 restart failed. The build is on disk but the running process is unchanged.');
      if (hadBackup) rollback();
      process.exit(1);
    }
  }

  // Step 5 — health check
  if (SKIP_HEALTH) {
    warn('--skip-health-check flag set — skipping post-deploy health check.');
  } else {
    log('Step 5/5 — Post-deploy health check…');
    const healthy = await healthCheck();
    if (!healthy) {
      fail(`Health check failed after ${HEALTH_CHECK_RETRIES} attempts.`);
      if (hadBackup) {
        warn('Unhealthy deploy detected — rolling back to previous build…');
        rollback();
        // Restart PM2 again to load the restored build
        if (!SKIP_PM2) pm2Reload();
        fail('Rollback complete. Investigate the build before redeploying.');
      }
      process.exit(1);
    }
  }

  ok('Deployment successful!');
  ok(`Platform live at: ${DOMAIN}`);
})();
