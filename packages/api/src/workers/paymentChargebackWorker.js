'use strict';
/**
 * Chargeback worker — Phase 2. On chargeback: freeze account, reverse coins, flag fraud.
 * Call from Stripe dispute webhook after upserting Chargeback.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { debit } = require('@millo/economy');
const fraudService = require('../services/fraudService');

/**
 * Resolve userId from Stripe charge metadata (optional).
 * @param {string} chargeId - Stripe charge ID
 * @returns {Promise<string|null>} userId or null
 */
async function resolveUserIdFromCharge(chargeId) {
  if (!chargeId) return null;
  try {
    const { getStripe } = require('@millo/billing/src/stripe');
    const stripe = getStripe();
    if (!stripe) return null;
    const charge = await stripe.charges.retrieve(chargeId);
    const userId = charge.metadata?.userId || charge.payment_intent?.metadata?.userId;
    return userId || null;
  } catch {
    return null;
  }
}

/**
 * Process a chargeback: freeze account, reverse coins, flag fraud.
 * @param {Object} chargeback - Chargeback document (or plain object with _id, userId?, stripeChargeId?, amountCents, status)
 * @param {Object} [log] - Optional request.log for logging
 * @returns {{ frozen: boolean, reversed: boolean, fraudFlagged: boolean, error?: string }}
 */
async function processChargeback(chargeback, log = console) {
  const out = { frozen: false, reversed: false, fraudFlagged: false };
  let userId = chargeback.userId ? chargeback.userId.toString() : null;
  if (!userId && chargeback.stripeChargeId) {
    userId = await resolveUserIdFromCharge(chargeback.stripeChargeId);
    if (userId && chargeback._id) {
      await db.Chargeback.updateOne(
        { _id: chargeback._id },
        { $set: { userId } }
      );
    }
  }
  if (!userId) {
    log.warn?.({ chargebackId: chargeback._id, stripeChargeId: chargeback.stripeChargeId }, 'Chargeback worker: no userId, skipping freeze/reverse');
    return out;
  }

  const amountCents = Math.abs(Number(chargeback.amountCents) || 0);
  const status = chargeback.status || 'open';

  // 1. Freeze account (suspended)
  try {
    await db.User.updateOne(
      { _id: userId },
      {
        $set: {
          status: 'suspended',
          suspensionReason: `Chargeback: ${chargeback.reason || status} (dispute ${chargeback.stripeDisputeId || 'n/a'})`,
          updatedAt: new Date(),
        },
      }
    );
    out.frozen = true;
  } catch (e) {
    log.error?.({ err: e, userId }, 'Chargeback worker: failed to freeze account');
    out.error = e.message;
  }

  // 2. Reverse coins (debit user by chargeback amount)
  if (amountCents > 0) {
    try {
      await debit(userId, amountCents, 'chargeback_reversal', chargeback.stripeDisputeId || chargeback._id?.toString(), {
        chargebackId: chargeback._id?.toString(),
        stripeDisputeId: chargeback.stripeDisputeId,
        stripeChargeId: chargeback.stripeChargeId,
      });
      out.reversed = true;
    } catch (e) {
      if (e.message === 'INSUFFICIENT_BALANCE') {
        log.warn?.({ userId, amountCents }, 'Chargeback worker: insufficient balance to reverse');
      } else {
        log.error?.({ err: e, userId, amountCents }, 'Chargeback worker: failed to reverse coins');
      }
      if (!out.error) out.error = e.message;
    }
  }

  // 3. Flag fraud score
  try {
    await fraudService.recordChargeback(userId, {
      chargebackId: chargeback._id?.toString(),
      amountCents,
      stripeDisputeId: chargeback.stripeDisputeId,
    });
    out.fraudFlagged = true;
  } catch (e) {
    log.error?.({ err: e, userId }, 'Chargeback worker: failed to flag fraud');
  }

  return out;
}

module.exports = { processChargeback, resolveUserIdFromCharge };
