#!/usr/bin/env node
'use strict';
/**
 * Phase 11 — Data retention purge. Run via cron (e.g. weekly).
 * Purges ModerationLog, AdminAuditLog, FinancialAuditLog older than retention policy.
 * Env: MODERATION_AUDIT_RETENTION_YEARS, ADMIN_AUDIT_RETENTION_YEARS, FINANCIAL_AUDIT_RETENTION_YEARS (default 7).
 * https://milloapp.com
 */
const db = require('@millo/database');
const compliance = require('@millo/compliance');

async function main() {
  await db.connect();
  const result = await compliance.purgeAllExpiredAuditData();
  console.log('Retention purge:', JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
