'use strict';
/**
 * Creator Revenue Velocity Detection — flags unnatural revenue spikes (e.g. $0, $0, $10,000 in 10 minutes).
 * Detection: if (revenueSpikeRatio > 20) flagCreator(creatorId, "revenue_spike").
 * https://milloapp.com
 */
const db = require('@millo/database');
const mongoose = require('mongoose');

const REVENUE_SPIKE_RATIO_THRESHOLD = Number(process.env.CREATOR_REVENUE_SPIKE_RATIO_THRESHOLD) || 20;
const SHORT_WINDOW_MS = Number(process.env.CREATOR_REVENUE_SHORT_WINDOW_MS) || 10 * 60 * 1000;   // 10 minutes
const BASELINE_WINDOW_MS = Number(process.env.CREATOR_REVENUE_BASELINE_WINDOW_MS) || 6 * 60 * 60 * 1000; // 6 hours
const MIN_SPIKE_REVENUE_CENTS = Number(process.env.CREATOR_REVENUE_MIN_SPIKE_CENTS) || 5000;   // $50 minimum to flag

/**
 * Sum creator revenue (credits to creator) in a time window.
 * LedgerEntry: type 'credit', actorId = creatorId, amountCents.
 */
async function getCreatorRevenueInWindow(creatorId, startDate, endDate) {
  const cid = creatorId?.toString?.() || creatorId;
  if (!cid) return 0;
  const result = await db.LedgerEntry.aggregate([
    {
      $match: {
        actorId: mongoose.Types.ObjectId.isValid(cid) ? new mongoose.Types.ObjectId(cid) : cid,
        type: 'credit',
        amountCents: { $gt: 0 },
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]);
  return result[0]?.total ?? 0;
}

/**
 * Revenue spike ratio: revenue in short window / average revenue per short-window in baseline period.
 * Example: last 10 min revenue vs avg per 10 min over previous 6 hours.
 */
async function getRevenueSpikeRatio(creatorId, opts = {}) {
  const cid = creatorId?.toString?.() || creatorId;
  if (!cid) return { ratio: 0, revenueShortCents: 0, avgBaselineCents: 0 };

  const shortMs = opts.shortWindowMs ?? SHORT_WINDOW_MS;
  const baselineMs = opts.baselineWindowMs ?? BASELINE_WINDOW_MS;
  const now = new Date();
  const shortStart = new Date(now.getTime() - shortMs);
  const baselineEnd = shortStart;
  const baselineStart = new Date(baselineEnd.getTime() - baselineMs);

  const [revenueShortCents, baselineTotalCents] = await Promise.all([
    getCreatorRevenueInWindow(cid, shortStart, now),
    getCreatorRevenueInWindow(cid, baselineStart, baselineEnd),
  ]);

  const numBuckets = Math.max(1, Math.floor(baselineMs / shortMs));
  const avgBaselineCents = baselineTotalCents / numBuckets;
  const safeAvg = Math.max(1, avgBaselineCents);
  const ratio = revenueShortCents / safeAvg;

  return {
    ratio: Math.round(ratio * 100) / 100,
    revenueShortCents,
    avgBaselineCents: Math.round(avgBaselineCents * 100) / 100,
  };
}

/**
 * Detect if creator has an unnatural revenue spike (ratio > threshold).
 */
async function detectRevenueSpike(creatorId, opts = {}) {
  const threshold = opts.ratioThreshold ?? REVENUE_SPIKE_RATIO_THRESHOLD;
  const minSpikeCents = opts.minSpikeCents ?? MIN_SPIKE_REVENUE_CENTS;

  const { ratio, revenueShortCents, avgBaselineCents } = await getRevenueSpikeRatio(creatorId, opts);
  const spike = ratio > threshold && revenueShortCents >= minSpikeCents;

  return {
    spike,
    ratio,
    revenueShortCents,
    avgBaselineCents,
    threshold,
  };
}

/**
 * Flag creator for revenue spike (or other reason). Creates FraudEvent for audit/review.
 */
async function flagCreator(creatorId, reason, meta = {}) {
  const refId = creatorId?.toString?.() || creatorId;
  if (!refId) return;
  await db.FraudEvent.create({
    userId: null,
    eventType: 'creator_revenue_spike',
    action: 'review',
    signals: Array.isArray(reason) ? reason : [reason],
    refType: 'creator',
    refId,
    meta: { reason: Array.isArray(reason) ? reason[0] : reason, ...meta },
  }).catch(() => {});
}

/**
 * Run detection and flag if spike. Returns detection result.
 */
async function checkAndFlagRevenueSpike(creatorId, opts = {}) {
  const result = await detectRevenueSpike(creatorId, opts);
  if (result.spike) {
    await flagCreator(creatorId, 'revenue_spike', {
      ratio: result.ratio,
      revenueShortCents: result.revenueShortCents,
      avgBaselineCents: result.avgBaselineCents,
      threshold: result.threshold,
    });
    try {
      const monetizationRiskAlertService = require('./monetizationRiskAlertService');
      await monetizationRiskAlertService.alertFraudTeam('revenue_spike', {
        creatorId: creatorId?.toString?.() || creatorId,
        ratio: result.ratio,
        revenueShortCents: result.revenueShortCents,
        threshold: result.threshold,
      }, { debounceMs: 0 });
    } catch (_) {}
  }
  return result;
}

module.exports = {
  getCreatorRevenueInWindow,
  getRevenueSpikeRatio,
  detectRevenueSpike,
  flagCreator,
  checkAndFlagRevenueSpike,
  REVENUE_SPIKE_RATIO_THRESHOLD,
  SHORT_WINDOW_MS,
  BASELINE_WINDOW_MS,
  MIN_SPIKE_REVENUE_CENTS,
};
