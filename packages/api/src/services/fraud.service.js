'use strict';
/**
 * Tiered anti-fraud policy (account age, payment failures, IP churn, bots, auction signals).
 * Complements `fraudService.js` (IP reputation, geo, velocity, Stripe Radar). Runs first as a fast gate.
 * Env: FRAUD_POLICY_GATE=false to disable; FRAUD_TIER_BLOCK (default 70), FRAUD_TIER_REVIEW (default 40).
 * https://milloapp.com
 */

const db = require('@millo/database');

const DECISION = Object.freeze({
  BLOCK: 'BLOCK',
  REVIEW: 'REVIEW',
  ALLOW: 'ALLOW',
});

function tierBlock() {
  return Number(process.env.FRAUD_TIER_BLOCK) || 70;
}

function tierReview() {
  return Number(process.env.FRAUD_TIER_REVIEW) || 40;
}

/**
 * @param {{
 *   accountAgeDays?: number,
 *   failedPayments?: number,
 *   ipChanges?: number,
 *   botEvents?: number,
 *   auctionFraudEvents?: number,
 * }} user — signal bag (not necessarily full User doc)
 * @returns {number}
 */
function calculateRiskScore(user = {}) {
  let score = 0;

  const age = Number(user.accountAgeDays);
  if (Number.isFinite(age) && age < 1) score += 30;

  const failed = Number(user.failedPayments);
  if (Number.isFinite(failed) && failed > 2) score += 40;

  const ipCh = Number(user.ipChanges);
  if (Number.isFinite(ipCh) && ipCh > 5) score += 20;

  const bots = Number(user.botEvents);
  if (Number.isFinite(bots) && bots > 0) score += 25;

  const auc = Number(user.auctionFraudEvents);
  if (Number.isFinite(auc) && auc > 0) score += 30;

  return Math.min(100, score);
}

/**
 * @param {number} score
 * @returns {'BLOCK'|'REVIEW'|'ALLOW'}
 */
function evaluateRisk(score) {
  const s = Number(score) || 0;
  if (s > tierBlock()) return DECISION.BLOCK;
  if (s > tierReview()) return DECISION.REVIEW;
  return DECISION.ALLOW;
}

class FraudBlockedError extends Error {
  constructor(message = 'Transaction blocked', extra = {}) {
    super(message);
    this.name = 'FraudBlockedError';
    this.code = 'FRAUD_TRANSACTION_BLOCKED';
    this.statusCode = 403;
    Object.assign(this, extra);
  }
}

/**
 * Load DB-backed signals for payment-time scoring.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {Promise<Record<string, number>>}
 */
async function collectPaymentRiskSignals(userId) {
  const uid = userId?.toString?.() || userId;
  if (!uid) {
    return {
      accountAgeDays: 999,
      failedPayments: 0,
      ipChanges: 0,
      botEvents: 0,
      auctionFraudEvents: 0,
    };
  }

  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [user, failedPayBlocks, chargebacks, ips, botEvents, auctionFraud] = await Promise.all([
    db.User.findById(uid).select('createdAt').lean(),
    db.FraudEvent.countDocuments({
      userId: uid,
      eventType: 'payment',
      action: 'block',
      createdAt: { $gte: since90 },
    }).catch(() => 0),
    db.Chargeback.countDocuments({ userId: uid, createdAt: { $gte: since90 } }).catch(() => 0),
    db.DeviceFingerprint.distinct('ip', { userId: uid }).catch(() => []),
    db.FraudEvent.countDocuments({
      userId: uid,
      eventType: 'viewer_spike',
      createdAt: { $gte: since7 },
    }).catch(() => 0),
    db.FraudEvent.countDocuments({
      userId: uid,
      eventType: 'auction_fraud',
      action: { $in: ['block', 'review'] },
      createdAt: { $gte: since30 },
    }).catch(() => 0),
  ]);

  const created = user?.createdAt ? new Date(user.createdAt).getTime() : Date.now();
  const accountAgeDays = (Date.now() - created) / (24 * 60 * 60 * 1000);
  const distinctIps = Array.isArray(ips) ? ips.filter(Boolean).length : 0;
  const failedPayments = failedPayBlocks + chargebacks;

  return {
    accountAgeDays,
    failedPayments,
    ipChanges: distinctIps,
    botEvents,
    auctionFraudEvents: auctionFraud,
  };
}

/**
 * Payment protection hook — throws {@link FraudBlockedError} when decision is BLOCK.
 * @param {string|import('mongoose').Types.ObjectId} userId
 */
async function assertPaymentTransactionAllowed(userId) {
  if (process.env.FRAUD_POLICY_GATE === 'false') return;

  const signals = await collectPaymentRiskSignals(userId);
  const score = calculateRiskScore(signals);
  const decision = evaluateRisk(score);

  if (decision === DECISION.BLOCK) {
    throw new FraudBlockedError('Transaction blocked', { score, signals, decision });
  }
}

module.exports = {
  DECISION,
  calculateRiskScore,
  evaluateRisk,
  collectPaymentRiskSignals,
  assertPaymentTransactionAllowed,
  FraudBlockedError,
};
