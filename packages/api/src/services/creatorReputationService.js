'use strict';
/**
 * Creator Reputation Score (CRS) — dynamic 0–100 score per creator.
 * Signals: account trust, content authenticity (CAS) average, audience authenticity, monetization behavior,
 * refund rate, report rate, payment history (chargebacks), community reputation (strikes).
 * Bands: 90–100 Trusted, 70–89 Good standing, 50–69 Monetization limited, 30–49 High risk, 0–29 Monetization disabled.
 * https://milloapp.com
 */
const db = require('@millo/database');
const trustScoreEngine = require('./trustScoreEngine');
const creatorManipulationService = require('./creatorManipulationService');
const engagementAuthenticityService = require('./engagementAuthenticityService');

const BAND_TRUSTED = 'trusted';
const BAND_GOOD_STANDING = 'good_standing';
const BAND_MONETIZATION_LIMITED = 'monetization_limited';
const BAND_HIGH_RISK = 'high_risk';
const BAND_MONETIZATION_DISABLED = 'monetization_disabled';

/** Score below this → monetization disabled (no payouts, no live monetization). */
const THRESHOLD_MONETIZATION_DISABLED = 30;
/** Score below this → no storefront / no auctions. */
const THRESHOLD_STOREFRONT_AUCTION = 50;

/**
 * Monetization access by score (enforcement):
 * 90+     Full monetization
 * 70–89   Normal
 * 50–69   Reduced reach (algorithmic promotion multiplier 0.7)
 * 30–49   Monetization limited (no storefront/auctions; payouts and gifts allowed)
 * <30     Monetization disabled (no payouts, no gifts, no storefront, no auctions)
 */
const ACCESS_FULL = 'full';
const ACCESS_NORMAL = 'normal';
const ACCESS_REDUCED_REACH = 'reduced_reach';
const ACCESS_LIMITED = 'limited';
const ACCESS_DISABLED = 'disabled';

/** When creator manipulation penalized, cap CRS at this (high risk). */
const CRS_WHEN_MANIPULATION_PENALIZED = Number(process.env.CRS_SCORE_WHEN_MANIPULATION_PENALIZED) || 25;

/** Weights for weighted average (sum = 1). */
const WEIGHT_ACCOUNT_TRUST = Number(process.env.CRS_WEIGHT_ACCOUNT_TRUST) || 0.2;
const WEIGHT_CONTENT_AUTHENTICITY = Number(process.env.CRS_WEIGHT_CONTENT_AUTHENTICITY) || 0.15;
const WEIGHT_AUDIENCE_AUTHENTICITY = Number(process.env.CRS_WEIGHT_AUDIENCE_AUTHENTICITY) || 0.15;
const WEIGHT_MONETIZATION_BEHAVIOR = Number(process.env.CRS_WEIGHT_MONETIZATION_BEHAVIOR) || 0.1;
const WEIGHT_REFUND_RATE = Number(process.env.CRS_WEIGHT_REFUND_RATE) || 0.1;
const WEIGHT_REPORT_RATE = Number(process.env.CRS_WEIGHT_REPORT_RATE) || 0.1;
const WEIGHT_PAYMENT_HISTORY = Number(process.env.CRS_WEIGHT_PAYMENT_HISTORY) || 0.1;
const WEIGHT_COMMUNITY_REPUTATION = Number(process.env.CRS_WEIGHT_COMMUNITY_REPUTATION) || 0.1;

const SIGNAL_WINDOW_DAYS = Number(process.env.CRS_SIGNAL_WINDOW_DAYS) || 365;

/** 'penalty' = formula from §4 (refund/chargeback/reports/strikes penalties + authenticity bonuses); 'weighted' = weighted average of all factors. */
const CRS_CALCULATION = (process.env.CRS_CALCULATION || 'penalty').toLowerCase();

/**
 * Get CRS band from numeric score.
 * @param {number} score 0–100
 * @returns {string} trusted | good_standing | monetization_limited | high_risk | monetization_disabled
 */
function getBandFromScore(score) {
  const s = Math.max(0, Math.min(100, Number(score)));
  if (s >= 90) return BAND_TRUSTED;
  if (s >= 70) return BAND_GOOD_STANDING;
  if (s >= 50) return BAND_MONETIZATION_LIMITED;
  if (s >= 30) return BAND_HIGH_RISK;
  return BAND_MONETIZATION_DISABLED;
}

/**
 * Gather all signals used to calculate creator trust (each factor 0–100; higher = better).
 * Category -> Signals: account trust, content authenticity avg, audience authenticity, monetization behavior,
 * refund rate score, report rate score, payment history, community reputation.
 */
async function gatherCreatorSignals(creatorId) {
  const cid = creatorId?.toString?.() || creatorId;
  if (!cid) {
    return {
      accountTrustScore: 0,
      creatorManipulation: true,
      contentAuthenticityAvg: 0,
      audienceAuthenticity: 0,
      monetizationBehavior: 0,
      refundRateScore: 0,
      reportRateScore: 0,
      paymentHistoryScore: 0,
      communityReputation: 0,
    };
  }

  const since = new Date(Date.now() - SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const streamIds = await db.LiveStream.find({ userId: cid }).select('_id').lean()
    .then((rows) => rows.map((r) => r._id.toString()));

  const [
    trustResult,
    penalized,
    casAvgResult,
    audienceMetrics,
    orderDispute,
    reportCount,
    chargebackCount,
    userStrike,
    giftFraudCount,
  ] = await Promise.all([
    trustScoreEngine.getTrustScore(cid).catch(() => ({ score: 50, factors: {} })),
    creatorManipulationService.isCreatorManipulationPenalized(cid),
    streamIds.length > 0
      ? db.ContentAuthenticity.aggregate([
          { $match: { contentId: { $in: streamIds }, contentType: 'livestream' } },
          { $group: { _id: null, avg: { $avg: '$authenticityScore' } } },
        ]).then((r) => (r[0]?.avg != null ? Math.round(r[0].avg * 10) / 10 : 50))
      : Promise.resolve(50),
    engagementAuthenticityService.getCreatorEngagementMetrics(cid).catch(() => ({ authenticity: 0 })),
    db.Order.distinct('_id', { 'items.creatorId': cid }).then(async (orderIds) => {
      const orderCount = orderIds.length;
      const disputeCount = orderCount === 0 ? 0 : await db.Dispute.countDocuments({ transactionId: { $in: orderIds }, createdAt: { $gte: since } });
      return { orderCount, disputeCount };
    }),
    db.Report.countDocuments({
      $or: [
        { targetType: 'user', targetId: cid },
        { targetType: 'stream', targetId: { $in: streamIds } },
        { targetType: 'content', targetId: { $in: streamIds } },
      ],
      createdAt: { $gte: since },
    }),
    db.Chargeback.countDocuments({ userId: cid }),
    db.UserStrike.findOne({ userId: cid }).select('strikeCount status').lean(),
    db.FraudEvent.countDocuments({
      refType: 'gift',
      'meta.receiverId': cid,
      action: 'block',
      createdAt: { $gte: since },
    }),
  ]);

  const accountTrustScore = Math.max(0, Math.min(100, Number(trustResult?.score) ?? 50));
  const contentAuthenticityAvg = Math.max(0, Math.min(100, Number(casAvgResult) ?? 50));
  const audienceAuthenticity = Math.max(0, Math.min(100, Math.round((audienceMetrics?.authenticity ?? 0) * 100)));
  const monetizationBehavior = giftFraudCount > 0 ? Math.max(0, 100 - giftFraudCount * 25) : 100;
  const orderCount = orderDispute?.orderCount ?? 0;
  const disputeCountAgainstCreator = orderDispute?.disputeCount ?? 0;
  const refundRateScore = Math.max(0, 100 - disputeCountAgainstCreator * 25);
  const reportRateScore = Math.max(0, 100 - Math.min(100, (reportCount || 0) * 20));
  const paymentHistoryScore = (chargebackCount || 0) > 0 ? Math.max(0, 30 - chargebackCount * 15) : Math.min(100, 50 + 50);
  const paymentHistoryScoreClamped = Math.max(0, Math.min(100, paymentHistoryScore));
  const strikeCountVal = userStrike?.strikeCount ?? 0;
  const status = userStrike?.status || 'active';
  let communityReputation = 100;
  if (status === 'banned') communityReputation = 0;
  else if (status === 'suspended') communityReputation = 50;
  else if (strikeCountVal >= 3) communityReputation = 0;
  else if (strikeCountVal === 2) communityReputation = 60;
  else if (strikeCountVal === 1) communityReputation = 80;

  return {
    accountTrustScore,
    creatorManipulation: !!penalized,
    contentAuthenticityAvg,
    audienceAuthenticity,
    monetizationBehavior,
    refundRateScore,
    reportRateScore,
    paymentHistoryScore: paymentHistoryScoreClamped,
    communityReputation,
    strikeCount: strikeCountVal,
    orderCount,
    disputeCount: disputeCountAgainstCreator,
    reportCount: reportCount ?? 0,
    chargebackCount: chargebackCount ?? 0,
  };
}

/**
 * Build penalty-formula metrics from gathered signals (avoids re-fetching when already have signals).
 */
function buildMetricsFromSignals(signals) {
  const orderCount = Math.max(1, signals.orderCount ?? 1);
  const refundRate = (signals.disputeCount ?? 0) / orderCount;
  const chargebackRate = (signals.chargebackCount ?? 0) > 0 ? 1 : 0;
  return {
    contentAuthenticity: signals.contentAuthenticityAvg ?? 0,
    audienceAuthenticity: signals.audienceAuthenticity ?? 0,
    refundRate: Math.min(1, refundRate),
    chargebackRate,
    abuseReports: signals.reportCount ?? 0,
    moderationStrikes: signals.strikeCount ?? 0,
  };
}

/**
 * Apply penalty formula: start 100, subtract refundRate*40, chargebackRate*50, abuseReports*5, moderationStrikes*10; add contentAuthenticity*0.3, audienceAuthenticity*0.2.
 */
function applyPenaltyFormula(metrics) {
  let score = 100;
  score -= (metrics.refundRate ?? 0) * 40;
  score -= (metrics.chargebackRate ?? 0) * 50;
  score -= (metrics.abuseReports ?? 0) * 5;
  score -= (metrics.moderationStrikes ?? 0) * 10;
  score += (metrics.contentAuthenticity ?? 0) * 0.3;
  score += (metrics.audienceAuthenticity ?? 0) * 0.2;
  return Math.max(Math.min(score, 100), 0);
}

/**
 * Collect metrics for penalty-based reputation formula.
 * Returns: contentAuthenticity (0–100), audienceAuthenticity (0–100), refundRate (0–1), chargebackRate (0–1), abuseReports (count), moderationStrikes (count).
 */
async function collectCreatorMetrics(creatorId) {
  const signals = await gatherCreatorSignals(creatorId);
  return buildMetricsFromSignals(signals);
}

/**
 * Reputation score from penalty formula (calls collectCreatorMetrics then applyPenaltyFormula).
 */
async function calculateCreatorReputation(creatorId) {
  const metrics = await collectCreatorMetrics(creatorId);
  return applyPenaltyFormula(metrics);
}

/**
 * Compute CRS from gathered signals (weighted average). If creator manipulation penalized, cap at CRS_WHEN_MANIPULATION_PENALIZED.
 */
function computeScoreFromSignals(signals) {
  let score =
    (signals.accountTrustScore || 0) * WEIGHT_ACCOUNT_TRUST +
    (signals.contentAuthenticityAvg ?? 50) * WEIGHT_CONTENT_AUTHENTICITY +
    (signals.audienceAuthenticity ?? 50) * WEIGHT_AUDIENCE_AUTHENTICITY +
    (signals.monetizationBehavior ?? 100) * WEIGHT_MONETIZATION_BEHAVIOR +
    (signals.refundRateScore ?? 100) * WEIGHT_REFUND_RATE +
    (signals.reportRateScore ?? 100) * WEIGHT_REPORT_RATE +
    (signals.paymentHistoryScore ?? 100) * WEIGHT_PAYMENT_HISTORY +
    (signals.communityReputation ?? 100) * WEIGHT_COMMUNITY_REPUTATION;
  if (signals.creatorManipulation) score = Math.min(score, CRS_WHEN_MANIPULATION_PENALIZED);
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

/**
 * Compute CRS for a creator from all signals. Optionally persist.
 * @param {string|ObjectId} creatorId
 * @param {{ persist?: boolean }} [opts]
 * @returns {Promise<{ score: number, band: string, factors?: object }>}
 */
async function computeCreatorReputation(creatorId, opts = {}) {
  const cid = creatorId?.toString?.() || creatorId;
  if (!cid) return { score: 0, band: BAND_MONETIZATION_DISABLED, factors: {} };

  const factors = await gatherCreatorSignals(cid);
  let score = CRS_CALCULATION === 'penalty'
    ? applyPenaltyFormula(buildMetricsFromSignals(factors))
    : computeScoreFromSignals(factors);
  if (factors.creatorManipulation) score = Math.min(score, CRS_WHEN_MANIPULATION_PENALIZED);
  score = Math.max(0, Math.min(100, Math.round(score * 10) / 10));
  const band = getBandFromScore(score);

  const factorsForStorage = {
    accountTrustScore: factors.accountTrustScore,
    creatorManipulation: factors.creatorManipulation,
    contentAuthenticityAvg: factors.contentAuthenticityAvg,
    audienceAuthenticity: factors.audienceAuthenticity,
    monetizationBehavior: factors.monetizationBehavior,
    refundRateScore: factors.refundRateScore,
    reportRateScore: factors.reportRateScore,
    paymentHistoryScore: factors.paymentHistoryScore,
    communityReputation: factors.communityReputation,
  };

  const metrics = {
    contentAuthenticity: factors.contentAuthenticityAvg ?? 0,
    audienceAuthenticity: factors.audienceAuthenticity ?? 0,
    refundRate: factors.refundRateScore ?? 0,
    chargebackRate: factors.paymentHistoryScore ?? 0,
    abuseReports: factors.reportRateScore ?? 0,
    moderationStrikes: factors.strikeCount ?? 0,
    accountTrustScore: factors.accountTrustScore ?? 0,
  };

  const monetizationStatus = {
    giftsEnabled: score >= THRESHOLD_MONETIZATION_DISABLED,
    subscriptionsEnabled: score >= THRESHOLD_MONETIZATION_DISABLED,
    storefrontEnabled: score >= THRESHOLD_STOREFRONT_AUCTION,
    auctionsEnabled: score >= THRESHOLD_STOREFRONT_AUCTION,
  };

  if (opts.persist !== false) {
    await db.CreatorReputation.findOneAndUpdate(
      { creatorId: cid },
      {
        $set: {
          score,
          reputationScore: score,
          band,
          metrics,
          monetizationStatus,
          factors: factorsForStorage,
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true }
    ).catch(() => {});
    const creatorTrustHistoryService = require('./creatorTrustHistoryService');
    await creatorTrustHistoryService.snapshot(cid, score, opts.reason || 'computed').catch(() => {});
  }

  return {
    score,
    reputationScore: score,
    band,
    factors: factorsForStorage,
    metrics,
    monetizationStatus,
    ...(phase4Trust ? { phase4Trust } : {}),
  };
}

/**
 * Get creator reputation (cached from CreatorReputation or compute and persist).
 * @param {string|ObjectId} creatorId
 * @returns {Promise<{ score: number, band: string, factors?: object }>}
 */
async function getCreatorReputation(creatorId) {
  const cid = creatorId?.toString?.() || creatorId;
  if (!cid) return { score: 0, band: BAND_MONETIZATION_DISABLED };

  const doc = await db.CreatorReputation.findOne({ creatorId: cid }).lean();
  if (doc) {
    const scoreVal = doc.reputationScore ?? doc.score;
    return {
      score: scoreVal,
      reputationScore: doc.reputationScore ?? doc.score,
      band: doc.band,
      factors: doc.factors || {},
      metrics: doc.metrics || {},
      monetizationStatus: doc.monetizationStatus || {},
    };
  }
  return computeCreatorReputation(cid, { persist: true });
}

/** Default CRS when no record (e.g. new creator). Used for feed so they get some reach. */
const DEFAULT_FEED_CRS_SCORE = Number(process.env.CRS_DEFAULT_FEED_SCORE) || 50;

/**
 * Batch: get creator reputation score (0–100) per creator for feed algorithm.
 * finalScore = contentScore * (creatorReputation / 100). Returns Map<creatorIdStr, score>.
 * Creators with flags.monetizationDisabled get 0.
 */
async function getCreatorReputationScoreMap(creatorIds) {
  const map = new Map();
  if (!creatorIds?.length) return map;
  const ids = [...new Set(creatorIds.map((id) => id?.toString?.() || id).filter(Boolean))];
  const [repos, users] = await Promise.all([
    db.CreatorReputation.find({ creatorId: { $in: ids } }).select('creatorId score reputationScore').lean(),
    db.User.find({ _id: { $in: ids } }).select('_id flags').lean(),
  ]);
  const disabledSet = new Set(
    (users || []).filter((u) => u.flags?.monetizationDisabled).map((u) => u._id?.toString?.() || u._id)
  );
  for (const r of repos || []) {
    const cid = r.creatorId?.toString?.() || r.creatorId;
    if (!cid) continue;
    if (disabledSet.has(cid)) {
      map.set(cid, 0);
      continue;
    }
    const score = Math.max(0, Math.min(100, r.reputationScore ?? r.score ?? DEFAULT_FEED_CRS_SCORE));
    map.set(cid, score);
  }
  for (const id of ids) {
    if (!map.has(id)) map.set(id, disabledSet.has(id) ? 0 : DEFAULT_FEED_CRS_SCORE);
  }
  return map;
}

/** Admin can disable monetization via User.flags.monetizationDisabled (Creator Review Queue action). */
async function isMonetizationDisabledByAdmin(creatorId) {
  const cid = creatorId?.toString?.() || creatorId;
  if (!cid) return false;
  const user = await db.User.findById(cid).select('flags').lean().catch(() => null);
  return !!(user?.flags?.monetizationDisabled);
}

/**
 * Payout eligibility: CRS >= 30 (not in 0–29 band). Blocked if admin disabled monetization.
 */
async function isPayoutEligible(creatorId) {
  if (await isMonetizationDisabledByAdmin(creatorId)) return false;
  const { score } = await getCreatorReputation(creatorId);
  return score >= THRESHOLD_MONETIZATION_DISABLED;
}

/**
 * Livestream monetization (gifts, subs, etc.): CRS >= 30. Blocked if admin disabled monetization.
 */
async function isLivestreamMonetizationEligible(creatorId) {
  if (await isMonetizationDisabledByAdmin(creatorId)) return false;
  const { score } = await getCreatorReputation(creatorId);
  return score >= THRESHOLD_MONETIZATION_DISABLED;
}

/**
 * Storefront privileges (create/sell products): CRS >= 50. Blocked if admin disabled monetization.
 */
async function isStorefrontEligible(creatorId) {
  if (await isMonetizationDisabledByAdmin(creatorId)) return false;
  const { score } = await getCreatorReputation(creatorId);
  return score >= THRESHOLD_STOREFRONT_AUCTION;
}

/**
 * Auction privileges (create auctions): CRS >= 50. Blocked if admin disabled monetization.
 */
async function isAuctionEligible(creatorId) {
  if (await isMonetizationDisabledByAdmin(creatorId)) return false;
  const { score } = await getCreatorReputation(creatorId);
  return score >= THRESHOLD_STOREFRONT_AUCTION;
}

/**
 * Algorithmic promotion multiplier (feed ranking, live discoverability). 0–1 by band.
 * trusted/good_standing = 1, monetization_limited = 0.7, high_risk = 0.3, monetization_disabled = 0.
 * Admin-disabled monetization (Creator Review Queue) → 0.
 */
async function getAlgorithmicPromotionMultiplier(creatorId) {
  if (await isMonetizationDisabledByAdmin(creatorId)) return 0;
  const { band } = await getCreatorReputation(creatorId);
  switch (band) {
    case BAND_TRUSTED:
    case BAND_GOOD_STANDING:
      return 1;
    case BAND_MONETIZATION_LIMITED:
      return Number(process.env.CRS_PROMO_MULT_LIMITED) || 0.7;
    case BAND_HIGH_RISK:
      return Number(process.env.CRS_PROMO_MULT_HIGH_RISK) || 0.3;
    case BAND_MONETIZATION_DISABLED:
    default:
      return 0;
  }
}

/**
 * Monetization access level from score. 90+ full, 70–89 normal, 50–69 reduced_reach, 30–49 limited, <30 disabled.
 */
function getMonetizationAccessLevelFromScore(score) {
  const s = Math.max(0, Math.min(100, Number(score)));
  if (s >= 90) return ACCESS_FULL;
  if (s >= 70) return ACCESS_NORMAL;
  if (s >= 50) return ACCESS_REDUCED_REACH;
  if (s >= 30) return ACCESS_LIMITED;
  return ACCESS_DISABLED;
}

/**
 * Get creator's monetization access level (full | normal | reduced_reach | limited | disabled).
 */
async function getMonetizationAccessLevel(creatorId) {
  const { score } = await getCreatorReputation(creatorId);
  return getMonetizationAccessLevelFromScore(score);
}

/**
 * Whether creator monetization is disabled (score < 30). When true: no payouts, no livestream gifts.
 * Example: if (await disableCreatorMonetization(creatorId)) { ... block ... }
 */
async function disableCreatorMonetization(creatorId) {
  const { score } = await getCreatorReputation(creatorId);
  return score < THRESHOLD_MONETIZATION_DISABLED;
}

/**
 * Whether auctions are disabled for this creator (score < 50). When true: cannot create auctions.
 * Example: if (await disableAuctions(creatorId)) { ... block ... }
 */
async function disableAuctions(creatorId) {
  const { score } = await getCreatorReputation(creatorId);
  return score < THRESHOLD_STOREFRONT_AUCTION;
}

module.exports = {
  getBandFromScore,
  gatherCreatorSignals,
  buildMetricsFromSignals,
  applyPenaltyFormula,
  collectCreatorMetrics,
  calculateCreatorReputation,
  computeScoreFromSignals,
  computeCreatorReputation,
  getCreatorReputation,
  getCreatorReputationScoreMap,
  DEFAULT_FEED_CRS_SCORE,
  isMonetizationDisabledByAdmin,
  isPayoutEligible,
  isLivestreamMonetizationEligible,
  isStorefrontEligible,
  isAuctionEligible,
  getAlgorithmicPromotionMultiplier,
  getMonetizationAccessLevelFromScore,
  getMonetizationAccessLevel,
  disableCreatorMonetization,
  disableAuctions,
  ACCESS_FULL,
  ACCESS_NORMAL,
  ACCESS_REDUCED_REACH,
  ACCESS_LIMITED,
  ACCESS_DISABLED,
  BAND_TRUSTED,
  BAND_GOOD_STANDING,
  BAND_MONETIZATION_LIMITED,
  BAND_HIGH_RISK,
  BAND_MONETIZATION_DISABLED,
  THRESHOLD_MONETIZATION_DISABLED,
  THRESHOLD_STOREFRONT_AUCTION,
};
