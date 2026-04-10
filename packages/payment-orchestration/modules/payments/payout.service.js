'use strict';
/**
 * Payout Service — moves funds from pending to payout.
 * Core logic: check balance, deduct, create PayoutRequest.
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');

/**
 * Request payout: deduct from wallet, create PayoutRequest.
 * @param {ObjectId} userId - Creator requesting payout
 * @param {number} amountCents - Amount in cents
 * @param {Object} opts - { provider?, currency? }
 * @returns {Object} PayoutRequest document
 */
async function requestPayout(userId, amountCents, opts = {}) {
  const provider = opts.provider || 'stripe_connect';
  const currency = opts.currency || 'USD';

  const wallet = await db.Wallet.findOne({ userId });
  if (!wallet) throw new Error('WALLET_NOT_FOUND');

  const available = wallet.balanceCents ?? 0;
  if (available < amountCents) {
    throw new Error('INSUFFICIENT_BALANCE');
  }

  wallet.balanceCents -= amountCents;
  await wallet.save();

  const idempotencyKey = `payout_${userId}_${Date.now()}`;
  const payout = await db.PayoutRequest.create({
    userId,
    amountCents,
    currency,
    provider,
    idempotencyKey,
    status: 'pending',
    meta: opts.meta || {},
  });

  if (typeof economy.upsertFromPayoutRequest === 'function') {
    economy.upsertFromPayoutRequest(payout).catch(() => {});
  }

  await db.FinancialAuditLog.create({
    action: 'payout_requested',
    amountCents,
    refType: 'PayoutRequest',
    refId: String(payout._id),
    actorId: userId,
    meta: { payoutId: String(payout._id), provider, currency },
  }).catch(() => {});

  return payout;
}

module.exports = { requestPayout };
