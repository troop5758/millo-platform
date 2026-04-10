'use strict';
/**
 * Creator payout worker facade — executes provider transfers after admin approval.
 * Production path: `approvePayout` in `@millo/billing` (Stripe / PayPal / Wise) + `paymentOrchestration.executePayoutWithChecks`.
 * Use this module from BullMQ/cron jobs instead of ad-hoc `console.log` stubs.
 * https://milloapp.com
 */

const db = require('@millo/database');
const paymentOrchestration = require('./paymentOrchestration');
const { approvePayout } = require('@millo/billing');

/**
 * Process a single payout by id (admin already approved or system id for automation).
 * Prefer `executePayoutWithChecks` for KYC re-validation.
 * @param {string} payoutId — PayoutRequest _id
 * @param {string} adminId — acting admin or SYSTEM_ADMIN_ID
 * @param {string} [note]
 */
async function processPayoutWithOrchestration(payoutId, adminId, note) {
  return paymentOrchestration.executePayoutWithChecks(payoutId, adminId, note);
}

/**
 * Lower-level: call billing `approvePayout` directly (no KYC re-check — use only if checks ran upstream).
 * @param {string} payoutId
 * @param {string} adminId
 * @param {string} [overrideReason]
 */
async function processPayoutDirect(payoutId, adminId, overrideReason) {
  return approvePayout(payoutId, adminId, overrideReason);
}

/**
 * @param {string} userId — creator user id (for logging / future batch)
 * @param {number} amountCents
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
async function processPayout(userId, amountCents) {
  const pending = await db.PayoutRequest.findOne({ userId, status: 'pending' }).sort({ createdAt: -1 }).lean();
  if (!pending) {
    return { ok: false, message: 'No pending PayoutRequest for user; use request endpoint first.' };
  }
  if (Number(pending.amountCents) !== Number(amountCents)) {
    return { ok: false, message: 'Amount does not match pending request; resolve by payoutId.' };
  }
  return {
    ok: false,
    message: 'Use processPayoutWithOrchestration(payoutId, adminId) after review; auto-send requires admin/system id.',
    payoutId: String(pending._id),
  };
}

module.exports = {
  processPayout,
  processPayoutWithOrchestration,
  processPayoutDirect,
};
