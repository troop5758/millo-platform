/**
 * Retry workers — process failed payout retries (queue integration).
 * https://milloapp.com
 */
const db = require('@millo/database');
const payouts = require('./payouts');

const RETRY_STATUS = 'failed';

async function getPayoutsForRetry() {
  return db.PayoutRequest.find({ status: RETRY_STATUS }).sort({ updatedAt: 1 }).limit(10).lean();
}

async function processRetry(payoutId) {
  const payout = await db.PayoutRequest.findById(payoutId);
  if (!payout || payout.status !== RETRY_STATUS) return { ok: false, reason: 'not_retryable' };
  try {
    await payouts.approvePayout(payoutId, payout.approvedBy);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function markPayoutFailed(payoutId) {
  return db.PayoutRequest.updateOne({ _id: payoutId }, { status: RETRY_STATUS });
}

module.exports = { getPayoutsForRetry, processRetry, markPayoutFailed };
