'use strict';
/**
 * Financial anomaly detection — unusual amounts, velocity, chargebacks.
 * Admin-only. Read-only; no auto-changes. Logs to audit.
 * https://milloapp.com
 */
const db = require('@millo/database');

const AMOUNT_THRESHOLD_CENTS = 50000; // $500 — flag single transactions above this
const VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const VELOCITY_THRESHOLD = 20; // transactions per hour per user
const LOOKBACK_DAYS = 7;

/**
 * Detect anomalies: unusual amounts, velocity, chargebacks.
 * @returns {Object} { alerts, summary }
 */
async function detectAnomalies(opts = {}) {
  const lookbackDays = opts.lookbackDays ?? LOOKBACK_DAYS;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const alerts = [];

  // 1. Unusual amounts — PaymentTransaction above threshold
  const largeTxs = await db.PaymentTransaction.find({
    status: 'completed',
    grossAmountCents: { $gte: AMOUNT_THRESHOLD_CENTS },
    createdAt: { $gte: since },
  })
    .sort({ grossAmountCents: -1 })
    .limit(20)
    .lean();

  if (largeTxs.length > 0) {
    alerts.push({
      type: 'unusual_amount',
      severity: 'medium',
      count: largeTxs.length,
      message: `Large transactions (≥$${AMOUNT_THRESHOLD_CENTS / 100}) in last ${lookbackDays} days`,
      items: largeTxs.map((t) => ({
        id: t._id,
        userId: t.userId,
        creatorId: t.creatorId,
        type: t.type,
        grossAmountCents: t.grossAmountCents,
        createdAt: t.createdAt,
      })),
    });
  }

  // 2. Velocity — users with many transactions in short window
  const txByUser = await db.PaymentTransaction.aggregate([
    { $match: { status: 'completed', createdAt: { $gte: since } } },
    { $group: { _id: '$userId', count: { $sum: 1 }, totalCents: { $sum: '$grossAmountCents' } } },
    { $match: { count: { $gte: VELOCITY_THRESHOLD } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  if (txByUser.length > 0) {
    alerts.push({
      type: 'high_velocity',
      severity: 'medium',
      count: txByUser.length,
      message: `Users with ≥${VELOCITY_THRESHOLD} completed transactions in last ${lookbackDays} days`,
      items: txByUser.map((r) => ({
        userId: r._id,
        transactionCount: r.count,
        totalCents: r.totalCents,
      })),
    });
  }

  // 3. Recent chargebacks
  const recentChargebacks = await db.Chargeback.find({
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  if (recentChargebacks.length > 0) {
    const openCount = recentChargebacks.filter((c) => c.status === 'open').length;
    alerts.push({
      type: 'chargebacks',
      severity: openCount > 0 ? 'high' : 'medium',
      count: recentChargebacks.length,
      openCount,
      message: `${recentChargebacks.length} chargeback(s) in last ${lookbackDays} days${openCount > 0 ? ` (${openCount} open)` : ''}`,
      items: recentChargebacks.slice(0, 10).map((c) => ({
        id: c._id,
        userId: c.userId,
        amountCents: c.amountCents,
        status: c.status,
        createdAt: c.createdAt,
      })),
    });
  }

  // 4. Large ledger credits (potential abuse)
  const largeCredits = await db.LedgerEntry.find({
    type: 'credit',
    amountCents: { $gte: AMOUNT_THRESHOLD_CENTS },
    createdAt: { $gte: since },
  })
    .sort({ amountCents: -1 })
    .limit(10)
    .lean();

  if (largeCredits.length > 0) {
    alerts.push({
      type: 'large_credits',
      severity: 'low',
      count: largeCredits.length,
      message: `Large ledger credits (≥$${AMOUNT_THRESHOLD_CENTS / 100}) in last ${lookbackDays} days`,
      items: largeCredits.map((e) => ({
        id: e._id,
        actorId: e.actorId,
        amountCents: e.amountCents,
        refType: e.refType,
        createdAt: e.createdAt,
      })),
    });
  }

  const summary = {
    alertCount: alerts.length,
    bySeverity: {
      high: alerts.filter((a) => a.severity === 'high').length,
      medium: alerts.filter((a) => a.severity === 'medium').length,
      low: alerts.filter((a) => a.severity === 'low').length,
    },
    lookbackDays,
  };

  return { alerts, summary };
}

module.exports = { detectAnomalies };
