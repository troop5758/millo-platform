'use strict';
/**
 * Compliance-oriented `AuditLog` helpers (financial + refunds). Payout settlement also writes
 * `FinancialAuditLog` / `AdminAuditLog` from `@millo/billing` — this layer adds searchable `AuditLog` rows.
 * https://milloapp.com
 */

const db = require('@millo/database');

/**
 * @param {{
 *   userId: string|import('mongoose').Types.ObjectId,
 *   amountCents: number,
 *   refType?: string,
 *   refId?: string,
 *   provider?: string,
 *   actorId?: string|import('mongoose').Types.ObjectId,
 *   meta?: Record<string, unknown>,
 * }} opts
 */
async function logRefundProcessed(opts = {}) {
  const {
    userId,
    amountCents,
    refType = 'stripe_charge',
    refId,
    provider = 'stripe',
    actorId,
    meta = {},
  } = opts;
  if (!userId) return;
  await db.writeAuditLog({
    action: 'REFUND_PROCESSED',
    userId,
    actorId: actorId || undefined,
    resourceType: refType,
    resourceId: refId != null ? String(refId) : undefined,
    meta: {
      amountCents: Math.round(Number(amountCents) || 0),
      provider,
      ...meta,
    },
  });
}

module.exports = {
  logRefundProcessed,
};
