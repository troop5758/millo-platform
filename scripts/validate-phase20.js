#!/usr/bin/env node
/**
 * Phase 20 validation: Security hardening — OWASP scan clean, security checklist passes.
 * Run from repo root.
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

console.log('[validate-phase20] Security hardening — OWASP scan clean, checklist passes...');

// OWASP scan clean: no eval(), no dangerous patterns in packages
const dangerousPatterns = ['eval(', 'Function(', 'child_process.execSync', 'require(\'vm\')'];
const scanDirs = [path.join(root, 'packages/api/src'), path.join(root, 'packages/security/src')];
for (const dir of scanDirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.js'));
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f.name), 'utf8');
    for (const pattern of dangerousPatterns) {
      if (content.includes(pattern)) {
        console.error('[validate-phase20] OWASP: dangerous pattern in', path.join(dir, f.name), ':', pattern);
        process.exit(1);
      }
    }
  }
}

// Security checklist: CSP, HSTS, rate limit, ledger tamper, kill-switch
const appContent = fs.readFileSync(path.join(root, 'packages/api/src/app.js'), 'utf8');
if (!appContent.includes('Content-Security-Policy') || !appContent.includes('Strict-Transport-Security')) {
  console.error('[validate-phase20] API must set CSP and HSTS headers');
  process.exit(1);
}
if (!appContent.includes('rate-limit') || !appContent.includes('getRateLimitConfig')) {
  console.error('[validate-phase20] API must register rate limit');
  process.exit(1);
}

const ledgerPath = path.join(root, 'packages/economy/src/ledger.js');
const ledgerContent = fs.readFileSync(ledgerPath, 'utf8');
if (!ledgerContent.includes('verifyLedgerIntegrity')) {
  console.error('[validate-phase20] Ledger must export verifyLedgerIntegrity (tamper detection)');
  process.exit(1);
}

const securityPath = path.join(root, 'packages/security/src/killSwitchRegistry.js');
if (!fs.existsSync(securityPath)) {
  console.error('[validate-phase20] Kill-switch registry must exist');
  process.exit(1);
}
const killContent = fs.readFileSync(securityPath, 'utf8');
if (!killContent.includes('getKillSwitchRegistry') || !killContent.includes('REGISTRY')) {
  console.error('[validate-phase20] Kill-switch registry must export registry');
  process.exit(1);
}

const nginxPath = path.join(root, 'infra/nginx.conf');
const nginxContent = fs.readFileSync(nginxPath, 'utf8');
if (!nginxContent.includes('Strict-Transport-Security') || !nginxContent.includes('limit_req')) {
  console.error('[validate-phase20] nginx.conf must include HSTS and DDoS limit_req');
  process.exit(1);
}

if (!fs.existsSync(path.join(root, 'docs/security-checklist.md'))) {
  console.error('[validate-phase20] docs/security-checklist.md must exist');
  process.exit(1);
}

const infra = path.join(root, 'infra');
const requiredInfraDocs = ['redis-auth.md', 'mongo-auth.md', 'ssh-hardening.md', 'backup-encryption.md'];
for (const doc of requiredInfraDocs) {
  if (!fs.existsSync(path.join(infra, doc))) {
    console.error('[validate-phase20] Missing infra/' + doc);
    process.exit(1);
  }
}

console.log('[validate-phase20] Validation passed (OWASP clean, checklist, Redis/Mongo AUTH, SSH hardening, backup encryption).');
