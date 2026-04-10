'use strict';
/**
 * Revenue analytics aggregates for admin — ARPU, LTV proxy, conversion, ad spend proxy.
 * Sources: `PaymentTransaction`, `User`, `AdDailySpend`; MAU from `analyticsService`.
 * Amounts are **integer cents**. https://milloapp.com
 */

const db = require('@millo/database');
const analyticsService = require('./analyticsService');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string|undefined} qFrom
 * @param {string|undefined} qTo
 * @returns {{ from: Date, to: Date, days: number }}
 */
function parseWindow(qFrom, qTo) {
  const to = qTo ? new Date(qTo) : new Date();
  if (Number.isNaN(to.getTime())) throw new Error('INVALID_TO_DATE');
  let from = qFrom ? new Date(qFrom) : new Date(to.getTime() - 30 * DAY_MS);
  if (Number.isNaN(from.getTime())) throw new Error('INVALID_FROM_DATE');
  if (from > to) {
    const t = from;
    from = to;
    to = t;
  }
  const days = Math.max(1, Math.ceil((to - from) / DAY_MS));
  return { from, to, days };
}

/**
 * @param {Date} from
 * @param {Date} to
 */
async function aggregatePaymentStats(from, to) {
  const match = {
    status: 'completed',
    userId: { $exists: true, $ne: null },
    createdAt: { $gte: from, $lte: to },
  };
  const rows = await db.PaymentTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$userId',
        userGross: { $sum: { $ifNull: ['$grossAmountCents', 0] } },
        userPlatform: { $sum: { $ifNull: ['$platformFeeCents', 0] } },
      },
    },
    {
      $group: {
        _id: null,
        grossCents: { $sum: '$userGross' },
        platformFeeCents: { $sum: '$userPlatform' },
        payingUsers: { $sum: 1 },
      },
    },
  ]);
  const r = rows[0] || {};
  return {
    grossCents: Math.round(Number(r.grossCents) || 0),
    platformFeeCents: Math.round(Number(r.platformFeeCents) || 0),
    payingUsers: Math.round(Number(r.payingUsers) || 0),
  };
}

/**
 * Lifetime average gross per paying user (all-time completed `PaymentTransaction`).
 */
async function aggregateLtvProxyCents() {
  const rows = await db.PaymentTransaction.aggregate([
    { $match: { status: 'completed', userId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: '$userId',
        totalGross: { $sum: { $ifNull: ['$grossAmountCents', 0] } },
      },
    },
    {
      $group: {
        _id: null,
        sumGross: { $sum: '$totalGross' },
        payers: { $sum: 1 },
      },
    },
  ]);
  const r = rows[0] || {};
  const sumGross = Math.round(Number(r.sumGross) || 0);
  const payers = Math.round(Number(r.payers) || 0);
  return {
    ltvAvgGrossCents: payers > 0 ? Math.round(sumGross / payers) : 0,
    payingUsersLifetime: payers,
    grossLifetimeCents: sumGross,
  };
}

/**
 * Sum `AdDailySpend.amountCents` in window — **advertiser spend** recorded for pacing (platform revenue proxy).
 * @param {Date} from
 * @param {Date} to
 */
async function aggregateAdSpendCents(from, to) {
  const start = new Date(from);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(23, 59, 59, 999);
  const rows = await db.AdDailySpend.aggregate([
    { $match: { date: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$amountCents', 0] } } } },
  ]);
  return Math.round(Number(rows[0]?.total) || 0);
}

/**
 * Signups in window who have at least one completed payment (any time).
 * @param {Date} from
 * @param {Date} to
 */
async function conversionSignupToPayerPct(from, to) {
  const signups = await db.User.find({ createdAt: { $gte: from, $lte: to } }).select('_id').lean();
  if (signups.length === 0) {
    return { signupCount: 0, convertedCount: 0, conversionPct: 0 };
  }
  const ids = signups.map((u) => u._id);
  const payers = await db.PaymentTransaction.distinct('userId', {
    status: 'completed',
    userId: { $in: ids },
  });
  const convertedCount = payers.length;
  return {
    signupCount: signups.length,
    convertedCount,
    conversionPct: Math.round((convertedCount / signups.length) * 100),
  };
}

/**
 * @param {{ from?: string, to?: string } | Record<string, string>} [query]
 */
async function getRevenueStats(query = {}) {
  const { from, to, days } = parseWindow(query.from, query.to);

  const [periodPay, ltv, adSpendCents, conversion, mau] = await Promise.all([
    aggregatePaymentStats(from, to),
    aggregateLtvProxyCents(),
    aggregateAdSpendCents(from, to),
    conversionSignupToPayerPct(from, to),
    analyticsService.getMAU().catch(() => 0),
  ]);

  const arpuPayerCents =
    periodPay.payingUsers > 0 ? Math.round(periodPay.grossCents / periodPay.payingUsers) : 0;
  const arpuMauCents = mau > 0 ? Math.round(periodPay.grossCents / mau) : 0;

  return {
    window: {
      from: from.toISOString(),
      to: to.toISOString(),
      days,
    },
    period: {
      grossRevenueCents: periodPay.grossCents,
      platformFeeCents: periodPay.platformFeeCents,
      payingUsers: periodPay.payingUsers,
    },
    arpu_cents_paying_users: arpuPayerCents,
    /** Period gross / rolling 30d MAU (see `analyticsService.getMAU`) — window may not match MAU definition. */
    arpu_cents_mau: arpuMauCents,
    mau,
    ltv_avg_gross_cents: ltv.ltvAvgGrossCents,
    paying_users_lifetime: ltv.payingUsersLifetime,
    gross_revenue_lifetime_cents: ltv.grossLifetimeCents,
    conversion: {
      signup_count: conversion.signupCount,
      converted_payer_count: conversion.convertedCount,
      conversion_pct: conversion.conversionPct,
      note: 'Share of users who signed up in the window and have any completed PaymentTransaction',
    },
    ad_revenue_proxy_cents: adSpendCents,
    ad_revenue_note:
      'Sum of AdDailySpend.amountCents (advertiser spend / pacing ledger) in the window — use as ad-side revenue proxy until dedicated ad settlement exists',
  };
}

module.exports = {
  parseWindow,
  getRevenueStats,
  aggregatePaymentStats,
  aggregateLtvProxyCents,
  aggregateAdSpendCents,
  conversionSignupToPayerPct,
};
