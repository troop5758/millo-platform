'use strict';
/**
 * Audit logging — re-exports @millo/database writers (critical security).
 * Admin overrides, financial mutations, and general sensitive actions must use these helpers.
 *
 * General AuditLog (compliance / search): prefer `writeAuditLog` so entries normalize `adminId`→`actorId`
 * and optional `userId`→`resourceId` when needed. Examples:
 * `await writeAuditLog({ action: 'USER_BANNED', userId, adminId, reason: 'FRAUD' });`
 * Payouts (also `FinancialAuditLog` in billing): `action: 'PAYOUT_SENT', userId, meta: { amountCents, provider }`
 * Refunds (Stripe webhook): `complianceAudit.logRefundProcessed({ userId, amountCents, refId })` → `REFUND_PROCESSED`
 * https://milloapp.com
 */
const {
  writeAdminAuditLog,
  writeFinancialAuditLog,
  writeAuditLog,
} = require('@millo/database');

module.exports = {
  writeAdminAuditLog,
  writeFinancialAuditLog,
  writeAuditLog,
};
