'use strict';
/**
 * Fraud + payment protection — same tier semantics as Phase 3 policy (`fraud.service.js`):
 * **`riskScore > FRAUD_TIER_BLOCK`** (default **70**) → block.
 *
 * - Use {@link assertPaymentTransactionAllowed} before card/coin checkout (already on many payment routes).
 * - Use {@link assertPaymentRiskScoreAllowed} when you already have a numeric risk score (e.g. gift evaluation).
 *
 * https://milloapp.com
 */

const fraudPolicy = require('./fraud.service');

function paymentBlockThreshold() {
  const n = Number(process.env.FRAUD_TIER_BLOCK);
  return Number.isFinite(n) && n >= 0 ? n : 70;
}

/**
 * Phase 3-style gate: block when score strictly exceeds policy threshold.
 * @param {number} riskScore
 * @param {number} [threshold] — defaults to `FRAUD_TIER_BLOCK` or 70
 */
function shouldBlockTransaction(riskScore, threshold = paymentBlockThreshold()) {
  return Number(riskScore) > Number(threshold);
}

class PaymentBlockedError extends Error {
  constructor(message = 'Transaction blocked due to risk policy', extra = {}) {
    super(message);
    this.name = 'PaymentBlockedError';
    this.code = 'PAYMENT_RISK_BLOCKED';
    this.statusCode = 403;
    Object.assign(this, extra);
  }
}

/**
 * Throws {@link PaymentBlockedError} when `riskScore` exceeds the block threshold (`> FRAUD_TIER_BLOCK`).
 * @param {number} riskScore
 * @param {Record<string, unknown>} [meta]
 */
function assertPaymentRiskScoreAllowed(riskScore, meta = {}) {
  const t = paymentBlockThreshold();
  if (shouldBlockTransaction(riskScore, t)) {
    throw new PaymentBlockedError('Transaction blocked', { riskScore, threshold: t, ...meta });
  }
}

/**
 * @param {number} riskScore
 * @see assertPaymentRiskScoreAllowed
 */
function blockTransaction(riskScore) {
  assertPaymentRiskScoreAllowed(riskScore);
}

module.exports = {
  paymentBlockThreshold,
  shouldBlockTransaction,
  assertPaymentRiskScoreAllowed,
  blockTransaction,
  PaymentBlockedError,
  assertPaymentTransactionAllowed: fraudPolicy.assertPaymentTransactionAllowed,
  FraudBlockedError: fraudPolicy.FraudBlockedError,
};
