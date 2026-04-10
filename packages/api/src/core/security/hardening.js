'use strict';
/**
 * Security hardening contract — aligns with Phase 20 (`docs/phase-20-security-hardening.md`).
 *
 * | Area | Implementation |
 * |------|----------------|
 * | **Rate limiting** | `@fastify/rate-limit` + `security.getRateLimitConfig()`; Redis-backed when `REDIS_URL` / `REDIS_HOST`; per-route limits on auth/payments/shop. |
 * | **CSP / HSTS** | `onSend` sets `Content-Security-Policy` + `Strict-Transport-Security` from `@millo/security`; `@fastify/helmet` (CSP/HSTS off in Helmet to avoid duplicates). |
 * | **TLS 1.3** | Nginx `ssl_protocols TLSv1.2 TLSv1.3`; edge CDN **Full (strict)** / min TLS per `infra/cloudflare/cdn-rules.md`. |
 * | **Audit logs** | `writeFinancialAuditLog`, `writeAdminAuditLog`, `writeAuditLog` — `packages/database/src/auditWrites.js` (financial + admin overrides per Millo rules). |
 * | **Encrypted backups** | `infra/backup-encryption.md` — encrypted `mongodump` / `pg_dump`, passphrase handling. |
 *
 * https://milloapp.com
 */

/** Documented pillars for tooling, onboarding, and compliance checklists. */
const HARDENING_PILLARS = Object.freeze({
  rateLimiting: {
    summary:
      'Global rate limit + Redis store when configured; stricter limits on auth and payments.',
    references: [
      'packages/api/src/app.js',
      'packages/security/src/rateLimit.js',
      'packages/api/src/lib/rateLimitRedisStore.js',
      'infra/nginx.conf (limit_req / limit_conn)',
    ],
  },
  cspHsts: {
    summary: 'CSP + HSTS on API responses; companion headers via Helmet.',
    references: [
      'packages/api/src/app.js (onSend hook)',
      'packages/security/src/headers.js',
    ],
  },
  tls13: {
    summary: 'TLS 1.3 enabled alongside 1.2 at reverse proxy; tighten minimum at CDN.',
    references: ['infra/nginx.conf', 'infra/cloudflare/cdn-rules.md'],
  },
  auditLogs: {
    summary: 'Centralized audit writers for financial, admin, and general compliance events.',
    references: [
      'packages/database/src/auditWrites.js',
      'packages/database/src/schemas/FinancialAuditLog.js',
      'packages/database/src/schemas/AdminAuditLog.js',
    ],
  },
  encryptedBackups: {
    summary: 'Backup encryption procedures and passphrase hygiene.',
    references: ['infra/backup-encryption.md', 'infra/backup-cron.sh'],
  },
});

function getSecurityHardeningContract() {
  return {
    pillars: {
      rateLimiting: { ...HARDENING_PILLARS.rateLimiting },
      cspHsts: { ...HARDENING_PILLARS.cspHsts },
      tls13: { ...HARDENING_PILLARS.tls13 },
      auditLogs: { ...HARDENING_PILLARS.auditLogs },
      encryptedBackups: { ...HARDENING_PILLARS.encryptedBackups },
    },
    productionUrl: 'https://milloapp.com',
    phaseDoc: 'docs/phase-20-security-hardening.md',
    validator: 'npm run validate:phase20',
  };
}

/**
 * Non-secret runtime hints (safe for `/admin` diagnostics).
 * @returns {{ rateLimitRedisStore: boolean, trustProxy: boolean, nodeEnv: string }}
 */
function getSecurityHardeningRuntimeHints() {
  const redisRl = !!(process.env.REDIS_URL || process.env.REDIS_HOST);
  return {
    rateLimitRedisStore: redisRl,
    trustProxy:
      process.env.TRUST_PROXY === 'true'
      || process.env.BEHIND_PROXY === 'true'
      || process.env.TRUST_PROXY === '1',
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

module.exports = {
  HARDENING_PILLARS,
  getSecurityHardeningContract,
  getSecurityHardeningRuntimeHints,
};
