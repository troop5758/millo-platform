'use strict';
/**
 * Phase 12 — Global Analytics & Business Intelligence.
 * Key metrics: DAU, MAU, creator revenue, ARPU, retention, conversion.
 * https://milloapp.com
 */
const db = require('@millo/database');

/**
 * DAU — distinct users with session in last 24h.
 */
async function getDAU() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db.Session.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$userId' } },
    { $count: 'dau' },
  ]);
  return result[0]?.dau ?? 0;
}

/**
 * MAU — distinct users with session in last 30 days.
 */
async function getMAU() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await db.Session.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$userId' } },
    { $count: 'mau' },
  ]);
  return result[0]?.mau ?? 0;
}

/**
 * Creator revenue (cents) — sum of credits to creators. Uses LedgerEntry.
 */
async function getCreatorRevenueCents(startDate, endDate) {
  const creatorIds = await db.CreatorWallet.distinct('creatorId');
  if (creatorIds.length === 0) return 0;
  const match = { type: 'credit', actorId: { $in: creatorIds } };
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = startDate;
    if (endDate) match.createdAt.$lte = endDate;
  }
  const result = await db.LedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]);
  return result[0]?.total ?? 0;
}

/**
 * Platform revenue (cents) — from FinancialAuditLog or Order. Used for ARPU.
 */
async function getPlatformRevenueCents(startDate, endDate) {
  const orderMatch = { status: 'paid' };
  if (startDate || endDate) {
    orderMatch.createdAt = {};
    if (startDate) orderMatch.createdAt.$gte = startDate;
    if (endDate) orderMatch.createdAt.$lte = endDate;
  }
  const orderResult = await db.Order.aggregate([
    { $match: orderMatch },
    { $group: { _id: null, total: { $sum: '$totalCents' } } },
  ]);
  const orderTotal = orderResult[0]?.total ?? 0;
  const auditMatch = { action: { $in: ['stripe_charge', 'stripe_payment_intent'] } };
  if (startDate || endDate) {
    auditMatch.createdAt = {};
    if (startDate) auditMatch.createdAt.$gte = startDate;
    if (endDate) auditMatch.createdAt.$lte = endDate;
  }
  const auditResult = await db.FinancialAuditLog.aggregate([
    { $match: auditMatch },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]);
  const auditTotal = auditResult[0]?.total ?? 0;
  return Math.max(auditTotal, orderTotal) || orderTotal;
}

/**
 * ARPU (cents) — platform revenue / MAU.
 */
async function getARPU(startDate, endDate) {
  const mau = await getMAU();
  if (mau === 0) return 0;
  const revenue = await getPlatformRevenueCents(startDate, endDate);
  return Math.round(revenue / mau);
}

/**
 * Retention rate (%) — users active in week N who were also active in week N+1.
 * Simplified: last 7 days vs previous 7 days.
 */
async function getRetentionPct() {
  const now = new Date();
  const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const prevWeekEnd = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const currWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [prevActive, currActive] = await Promise.all([
    db.Session.distinct('userId', { createdAt: { $gte: prevWeekStart, $lt: prevWeekEnd } }),
    db.Session.distinct('userId', { createdAt: { $gte: currWeekStart } }),
  ]);
  const prevSet = new Set(prevActive.map(String));
  const currSet = new Set(currActive.map(String));
  const retained = [...prevSet].filter((id) => currSet.has(id)).length;
  return prevSet.size > 0 ? Math.round((retained / prevSet.size) * 100) : 0;
}

/**
 * Conversion rate (%) — signups who made a purchase within 30 days.
 * Simplified: users with Order or PpvPurchase / total users (last 30 days signups).
 */
async function getConversionPct() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const signups = await db.User.countDocuments({ createdAt: { $gte: since } });
  if (signups === 0) return 0;
  const [orderUsers, ppvUsers] = await Promise.all([
    db.Order.distinct('userId', { createdAt: { $gte: since } }),
    db.PpvPurchase.distinct('userId', { createdAt: { $gte: since } }),
  ]);
  const paidSet = new Set([...orderUsers.map(String), ...ppvUsers.map(String)]);
  return Math.round((paidSet.size / signups) * 100);
}

/**
 * Compute all metrics for a given date (for snapshot).
 */
async function computeMetricsForDate(date) {
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const dauSince = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  const mauSince = new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [dau, mau, creatorRevenue, platformRevenue, retention, conversion] = await Promise.all([
    db.Session.distinct('userId', { createdAt: { $gte: dauSince, $lte: endOfDay } }).then((r) => r.length),
    db.Session.distinct('userId', { createdAt: { $gte: mauSince, $lte: endOfDay } }).then((r) => r.length),
    getCreatorRevenueCents(startOfDay, endOfDay),
    getPlatformRevenueCents(startOfDay, endOfDay),
    getRetentionPct(),
    getConversionPct(),
  ]);

  const arpu = mau > 0 ? Math.round(platformRevenue / mau) : 0;

  return {
    dau,
    mau,
    creator_revenue_cents: creatorRevenue,
    arpu_cents: arpu,
    retention_pct: retention,
    conversion_pct: conversion,
  };
}

/**
 * Device breakdown — DAU by device type (Session.meta.deviceType). Phase 12.
 * Clients should pass deviceType (ios|android|web) in login/register body.
 */
async function getDeviceBreakdown() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db.Session.aggregate([
    { $match: { createdAt: { $gte: since }, 'meta.deviceType': { $exists: true, $ne: '' } } },
    { $group: { _id: '$meta.deviceType', count: { $sum: 1 } } },
  ]);
  const breakdown = { ios: 0, android: 0, web: 0, other: 0 };
  for (const r of result) {
    const k = String(r._id || '').toLowerCase();
    if (k === 'ios' || k === 'iphone') breakdown.ios += r.count;
    else if (k === 'android') breakdown.android += r.count;
    else if (k === 'web' || k === 'desktop') breakdown.web += r.count;
    else breakdown.other += r.count;
  }
  return breakdown;
}

/**
 * Get current metrics (real-time).
 */
async function getCurrentMetrics() {
  const [dau, mau, creatorRevenue, arpu, retention, conversion] = await Promise.all([
    getDAU(),
    getMAU(),
    getCreatorRevenueCents(),
    getARPU(),
    getRetentionPct(),
    getConversionPct(),
  ]);
  return {
    dau,
    mau,
    creator_revenue_cents: creatorRevenue,
    arpu_cents: arpu,
    retention_pct: retention,
    conversion_pct: conversion,
  };
}

/**
 * Store daily snapshot.
 */
async function storeDailySnapshot(date) {
  const metrics = await computeMetricsForDate(date);
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);

  for (const [metric, value] of Object.entries(metrics)) {
    await db.PlatformMetric.findOneAndUpdate(
      { date: startOfDay, metric },
      { $set: { value, updatedAt: new Date() } },
      { upsert: true }
    );
  }
  return metrics;
}

/**
 * Mixpanel — send event. Set MIXPANEL_TOKEN to enable.
 */
async function sendMixpanelEvent(eventName, distinctId, props = {}) {
  const token = process.env.MIXPANEL_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch('https://api.mixpanel.com/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: eventName,
        properties: { distinct_id: distinctId, token, ...props },
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[analytics] Mixpanel error:', err?.message);
    return null;
  }
}

/**
 * Amplitude — send event. Set AMPLITUDE_API_KEY to enable.
 */
/**
 * Feed funnel from FeedEvent (warehouse-style; window in hours).
 * Watch time: sum of watchTimeMs on `complete` (primary KPI).
 * CTR: plays / impressions. Completion: completes / plays.
 */
async function getFeedRankingKpis(hoursWindow = 24) {
  const h = Math.min(168, Math.max(1, Number(hoursWindow) || 24));
  const since = new Date(Date.now() - h * 60 * 60 * 1000);
  const base = { ts: { $gte: since } };
  const [impressions, plays, completes, watchSum] = await Promise.all([
    db.FeedEvent.countDocuments({ ...base, eventType: 'impression' }),
    db.FeedEvent.countDocuments({ ...base, eventType: 'play' }),
    db.FeedEvent.countDocuments({ ...base, eventType: 'complete' }),
    db.FeedEvent.aggregate([
      { $match: { ...base, eventType: 'complete', watchTimeMs: { $gt: 0 } } },
      { $group: { _id: null, totalMs: { $sum: '$watchTimeMs' } } },
    ]),
  ]);
  const totalWatchSeconds = (watchSum[0]?.totalMs ?? 0) / 1000;
  const ctr = impressions > 0 ? plays / impressions : null;
  const completionVsPlay = plays > 0 ? completes / plays : null;
  const avgWatchSecondsPerComplete = completes > 0 ? totalWatchSeconds / completes : null;
  return {
    window_hours: h,
    impressions,
    plays,
    completes,
    total_watch_time_seconds: Math.round(totalWatchSeconds),
    ctr_play_per_impression: ctr != null ? Math.round(ctr * 10000) / 10000 : null,
    completion_rate_complete_per_play: completionVsPlay != null ? Math.round(completionVsPlay * 10000) / 10000 : null,
    avg_watch_seconds_per_complete:
      avgWatchSecondsPerComplete != null ? Math.round(avgWatchSecondsPerComplete * 100) / 100 : null,
  };
}

function utcDayKeyFromDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Approximate D1 / D7 retention (platform): cohort signup 14d–7d ago, return = Session on UTC calendar day +1 / +7.
 */
async function getSignupRetentionD1D7Approx() {
  const now = Date.now();
  const cohortStart = new Date(now - 14 * 86400000);
  const cohortEnd = new Date(now - 7 * 86400000);
  const users = await db.User.find({ createdAt: { $gte: cohortStart, $lt: cohortEnd } })
    .select('_id createdAt')
    .lean();
  const n = users.length;
  if (n === 0) {
    return {
      cohort_users: 0,
      retention_d1_pct: null,
      retention_d7_pct: null,
      note: 'No users in cohort (signed up between 14d and 7d ago, UTC).',
    };
  }
  const ids = users.map((u) => u._id);
  const sessions = await db.Session.find({ userId: { $in: ids } }).select('userId createdAt').lean();
  const byUser = new Map();
  for (const s of sessions) {
    const k = String(s.userId);
    if (!byUser.has(k)) byUser.set(k, new Set());
    byUser.get(k).add(utcDayKeyFromDate(s.createdAt));
  }
  let d1 = 0;
  let d7 = 0;
  for (const u of users) {
    const uid = String(u._id);
    const daySet = byUser.get(uid) || new Set();
    const signupDay = utcDayKeyFromDate(u.createdAt);
    const s0 = new Date(`${signupDay}T00:00:00.000Z`);
    const d1Key = new Date(s0.getTime() + 86400000).toISOString().slice(0, 10);
    const d7Key = new Date(s0.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    if (daySet.has(d1Key)) d1++;
    if (daySet.has(d7Key)) d7++;
  }
  return {
    cohort_users: n,
    retention_d1_pct: Math.round((d1 / n) * 10000) / 100,
    retention_d7_pct: Math.round((d7 / n) * 10000) / 100,
    cohort_definition_utc:
      'Users created in [now-14d, now-7d); retained if any Session on signup calendar day +1 / +7 (UTC).',
  };
}

/**
 * Part 10 — What matters: watch time, completion, CTR components, D1/D7 retention snapshot.
 * @param {{ hoursWindow?: number|string }} [query]
 */
async function getFeedProductMetrics(query = {}) {
  const hoursWindow = query.hoursWindow != null ? Number(query.hoursWindow) : 24;
  const [feed_events, user_retention] = await Promise.all([
    getFeedRankingKpis(hoursWindow),
    getSignupRetentionD1D7Approx(),
  ]);
  return {
    feed_events,
    user_retention,
    kpi_definitions: {
      watch_time:
        'Sum of watchTimeMs/1000 on FeedEvent complete in window (clients should send terminal duration once).',
      completion_rate: 'completes / plays in window (requires impression→play→complete funnel).',
      ctr: 'plays / impressions in window (feed card click-through to play).',
      retention_d1_d7:
        user_retention.cohort_definition_utc ||
        user_retention.note ||
        'Session-based cohort (see user_retention).',
    },
  };
}

async function sendAmplitudeEvent(eventType, userId, eventProperties = {}) {
  const apiKey = process.env.AMPLITUDE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api2.amplitude.com/2/httpapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        events: [{ event_type: eventType, user_id: String(userId), event_properties: eventProperties }],
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('[analytics] Amplitude error:', err?.message);
    return null;
  }
}

module.exports = {
  getDAU,
  getMAU,
  getCreatorRevenueCents,
  getPlatformRevenueCents,
  getARPU,
  getRetentionPct,
  getConversionPct,
  getDeviceBreakdown,
  computeMetricsForDate,
  getCurrentMetrics,
  storeDailySnapshot,
  sendMixpanelEvent,
  sendAmplitudeEvent,
  getFeedRankingKpis,
  getSignupRetentionD1D7Approx,
  getFeedProductMetrics,
};
