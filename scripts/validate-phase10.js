#!/usr/bin/env node
/**
 * Phase 10 validation: RBAC enforced, overrides logged.
 * Run from repo root.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase10] Dashboards — RBAC and overrides logged...');

// 1) RBAC tests
try {
  execSync('node --test packages/dashboards/src/roles.test.js', { cwd: root, stdio: 'inherit' });
} catch (e) {
  console.error('[validate-phase10] RBAC tests failed.');
  process.exit(1);
}

// 2) Overrides logged: admin/moderator/support must write to AdminAuditLog
const adminSrc = fs.readFileSync(path.join(root, 'packages/dashboards/src/admin.js'), 'utf8');
const modSrc = fs.readFileSync(path.join(root, 'packages/dashboards/src/moderator.js'), 'utf8');
const supportSrc = fs.readFileSync(path.join(root, 'packages/dashboards/src/support.js'), 'utf8');
if (!adminSrc.includes('AdminAuditLog.create') || !modSrc.includes('AdminAuditLog.create') || !supportSrc.includes('AdminAuditLog.create')) {
  console.error('[validate-phase10] Overrides must be logged: AdminAuditLog.create missing in dashboard modules.');
  process.exit(1);
}

console.log('[validate-phase10] Validation passed (RBAC enforced, overrides logged).');
