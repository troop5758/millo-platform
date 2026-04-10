'use strict';
/**
 * Lightweight scoring hook for queued/orchestrated paths (platform also uses fraudService / fraudPolicy on HTTP routes).
 * https://milloapp.com
 */

function scoreTransaction({ amount, isNewDevice, isVPN, velocity }) {
  let score = 0;
  if (amount > 50000) score += 40;
  if (isNewDevice) score += 20;
  if (isVPN) score += 30;
  if (velocity > 10) score += 30;
  return score;
}

function assertAllowed(score) {
  if (score > 70) {
    const err = new Error('FRAUD_BLOCKED');
    err.code = 'FRAUD_BLOCKED';
    throw err;
  }
}

module.exports = { scoreTransaction, assertAllowed };
