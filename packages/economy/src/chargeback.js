/**
 * Chargeback detection and handling — Millo economy.
 * Wraps Chargeback schema; records from Stripe webhooks; supports admin listing.
 * https://milloapp.com
 */
'use strict';

const db = require('@millo/database');

/** Chargeback statuses (Stripe: open, won, lost, warning_closed) */
const STATUS = Object.freeze({
  OPEN: 'open',
  WON: 'won',
  LOST: 'lost',
  WARNING_CLOSED: 'warning_closed',
});

/**
 * Record a chargeback from Stripe dispute webhook.
 * @param {Object} opts
 * @param {string} opts.stripeDisputeId - Stripe dispute ID (unique)
 * @param {string} [opts.stripeChargeId] - Stripe charge ID
 * @param {number} opts.amountCents
 * @param {string} [opts.currency]
 * @param {string} [opts.status]
 * @param {string} [opts.reason]
 * @param {string} [opts.userId]
 * @param {string} [opts.refType]
 * @param {string} [opts.refId]
 * @returns {Promise<Object>} Created Chargeback
 */
async function recordChargeback(opts) {
  const record = await db.Chargeback.create({
    stripeDisputeId: opts.stripeDisputeId,
    stripeChargeId: opts.stripeChargeId,
    amountCents: opts.amountCents,
    currency: opts.currency || 'usd',
    status: opts.status || STATUS.OPEN,
    reason: opts.reason,
    userId: opts.userId,
    refType: opts.refType,
    refId: opts.refId,
    meta: opts.meta || {},
  });
  const obj = record.toObject();
  try {
    const { upsertFromChargeback } = require('./moneyIndexWrite');
    await upsertFromChargeback(obj);
  } catch {
    /* non-fatal */
  }
  return obj;
}

/**
 * Get chargeback by Stripe dispute or charge ID.
 * @param {string} stripeDisputeId
 * @returns {Promise<Object|null>}
 */
async function getByStripeDisputeId(stripeDisputeId) {
  return db.Chargeback.findOne({ stripeDisputeId }).lean();
}

/**
 * Get chargeback by Stripe charge ID.
 * @param {string} stripeChargeId
 * @returns {Promise<Object|null>}
 */
async function getByStripeChargeId(stripeChargeId) {
  return db.Chargeback.findOne({ stripeChargeId }).lean();
}

/**
 * List chargebacks for admin dashboard.
 * @param {Object} opts
 * @param {string} [opts.status]
 * @param {string} [opts.userId]
 * @param {number} [opts.limit]
 * @returns {Promise<Object[]>}
 */
async function listChargebacks(opts = {}) {
  const { status, userId, limit = 50 } = opts;
  const q = {};
  if (status) q.status = status;
  if (userId) q.userId = userId;
  return db.Chargeback.find(q).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * Update chargeback status (e.g. after Stripe dispute.updated).
 * @param {string} stripeDisputeId
 * @param {string} newStatus
 * @returns {Promise<Object|null>}
 */
async function updateStatus(stripeDisputeId, newStatus) {
  const updated = await db.Chargeback.findOneAndUpdate(
    { stripeDisputeId },
    { $set: { status: newStatus } },
    { new: true }
  ).lean();
  if (updated) {
    try {
      const { upsertFromChargeback } = require('./moneyIndexWrite');
      await upsertFromChargeback(updated);
    } catch {
      /* non-fatal */
    }
  }
  return updated;
}

module.exports = {
  STATUS,
  recordChargeback,
  getByStripeDisputeId,
  getByStripeChargeId,
  listChargebacks,
  updateStatus,
};
