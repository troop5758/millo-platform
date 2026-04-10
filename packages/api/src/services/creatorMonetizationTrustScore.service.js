'use strict';
/**
 * Phase 4 — Creator monetization trust score (monetization control layer).
 * Formula (scaled inputs so scores align with gates 0 / 80):
 *   score = followerFeature*0.2 + watchFeature*0.3 + violationPenalty*(-0.5) + fraudSignals*(-1.0)
 *   followerFeature = min(100, sqrt(followerCount))
 *   watchFeature    = min(100, sqrt(totalWatchHours))  — hours from ContentEngagement on creator streams
 *   violationPenalty = strikes + min(50, validatedReports)
 *   fraudSignals     = FraudEvent count (user as subject, window)
 * Enforcement (CREATOR_TRUST_PHASE4_ENFORCEMENT=true):
 *   score < 0  → disable monetization (User.flags + CreatorReputation monetizationStatus)
 *   score > 80 → enable premium trust features (User.flags.premiumTrustFeatures)
 * https://milloapp.com
 */
const db = require('@millo/database');

const WINDOW_MS = Number(process.env.CREATOR_TRUST_PHASE4_WINDOW_DAYS || 365) * 24 * 60 * 60 * 1000;

/**
 * Pure formula on normalized/scaled inputs (Phase 4 spec).
 * @param {{
 *   followerFeature?: number,
 *   watchFeature?: number,
 *   violationPenalty?: number,
 *   fraudSignals?: number,
 * }} p
 */
function calculateCreatorMonetizationTrustScore(p = {}) {
  const f = Math.max(0, Math.min(100, Number(p.followerFeature) || 0));
  const w = Math.max(0, Math.min(100, Number(p.watchFeature) || 0));
  const v = Math.max(0, Number(p.violationPenalty) || 0);
  const fr = Math.max(0, Number(p.fraudSignals) || 0);
  const score = f * 0.2 + w * 0.3 + v * -0.5 + fr * -1.0;
  return Math.round(score * 100) / 100;
}

async function gatherPhase4Inputs(creatorId) {
  const cid = creatorId?.toString?.() || creatorId;
  if (!cid) {
    return {
      followerCount: 0,
      totalWatchHours: 0,
      violationPenalty: 0,
      fraudSignals: 0,
      followerFeature: 0,
      watchFeature: 0,
    };
  }
  const since = new Date(Date.now() - WINDOW_MS);
  const streamIds = await db.LiveStream.find({ userId: cid }).select('_id').lean();
  const sids = streamIds.map((r) => r._id);
  const sidStrs = streamIds.map((r) => String(r._id));

  const [followerCount, watchAgg, userStrike, reportCount, fraudCount] = await Promise.all([
    db.Follow.countDocuments({ followingId: cid }),
    sidStrs.length
      ? db.ContentEngagement.aggregate([
          {
            $match: {
              contentType: 'stream',
              $or: [{ contentId: { $in: sids } }, { contentId: { $in: sidStrs } }],
            },
          },
          { $group: { _id: null, totalSec: { $sum: '$watchTimeSeconds' } } },
        ]).then((r) => Math.max(0, Number(r[0]?.totalSec) || 0))
      : Promise.resolve(0),
    db.UserStrike.findOne({ userId: cid }).select('strikeCount status').lean(),
    db.Report.countDocuments({
      $or: [
        { targetType: 'user', targetId: cid },
        { targetType: 'stream', targetId: { $in: sidStrs } },
      ],
      createdAt: { $gte: since },
    }),
    db.FraudEvent.countDocuments({
      userId: cid,
      createdAt: { $gte: since },
    }),
  ]);

  let strikePart = Number(userStrike?.strikeCount || 0);
  if (userStrike?.status === 'banned') strikePart = Math.max(strikePart, 50);
  const reportsCapped = Math.min(50, Number(reportCount) || 0);
  const violationPenalty = strikePart + reportsCapped;
  const fraudSignals = Math.min(500, Number(fraudCount) || 0);

  const followerFeature = Math.min(100, Math.sqrt(Math.max(0, followerCount)));
  const totalWatchHours = watchAgg / 3600;
  const watchFeature = Math.min(100, Math.sqrt(Math.max(0, totalWatchHours)));

  return {
    followerCount,
    totalWatchHours,
    violationPenalty,
    fraudSignals,
    followerFeature,
    watchFeature,
  };
}

async function computePhase4Trust(creatorId) {
  const inputs = await gatherPhase4Inputs(creatorId);
  const score = calculateCreatorMonetizationTrustScore({
    followerFeature: inputs.followerFeature,
    watchFeature: inputs.watchFeature,
    violationPenalty: inputs.violationPenalty,
    fraudSignals: inputs.fraudSignals,
  });
  return {
    score,
    ...inputs,
  };
}

async function disableMonetization(userId) {
  const uid = userId?.toString?.() || userId;
  if (!uid) return;
  await db.User.findByIdAndUpdate(
    uid,
    {
      $set: {
        'flags.monetizationDisabled': true,
        'flags.monetizationSuppressedByPhase4': true,
      },
    },
    { strict: false },
  ).catch(() => {});
}

async function enablePremiumFeatures(userId) {
  const uid = userId?.toString?.() || userId;
  if (!uid) return;
  await db.User.findByIdAndUpdate(
    uid,
    { $set: { 'flags.premiumTrustFeatures': true } },
    { strict: false },
  ).catch(() => {});
}

async function clearPhase4MonetizationSuppression(userId) {
  const uid = userId?.toString?.() || userId;
  if (!uid) return;
  await db.User.findByIdAndUpdate(
    uid,
    {
      $unset: {
        'flags.monetizationDisabled': '',
        'flags.monetizationSuppressedByPhase4': '',
      },
    },
    { strict: false },
  ).catch(() => {});
}

/**
 * Run gates + persist phase4Trust on CreatorReputation. Call from CRS compute when enforcement on.
 * @param {string} creatorId
 * @param {{ giftsEnabled: boolean, subscriptionsEnabled: boolean, storefrontEnabled: boolean, auctionsEnabled: boolean }} crsMonetizationStatus
 * @returns {Promise<{ score: number, monetizationStatus: object, phase4Trust: object }>}
 */
async function applyPhase4Enforcement(creatorId, crsMonetizationStatus) {
  const cid = creatorId?.toString?.() || creatorId;
  const result = await computePhase4Trust(cid);
  const { score } = result;

  const phase4Trust = {
    score,
    followerFeature: result.followerFeature,
    watchFeature: result.watchFeature,
    violationPenalty: result.violationPenalty,
    fraudSignals: result.fraudSignals,
    followerCount: result.followerCount,
    totalWatchHours: Math.round(result.totalWatchHours * 100) / 100,
    updatedAt: new Date(),
  };

  let monetizationStatus = { ...crsMonetizationStatus };
  const user = await db.User.findById(cid).select('flags').lean().catch(() => null);
  const suppressedByP4 = !!user?.flags?.monetizationSuppressedByPhase4;

  if (score < 0) {
    monetizationStatus = {
      giftsEnabled: false,
      subscriptionsEnabled: false,
      storefrontEnabled: false,
      auctionsEnabled: false,
    };
    await disableMonetization(cid);
  } else if (suppressedByP4) {
    await clearPhase4MonetizationSuppression(cid);
    monetizationStatus = { ...crsMonetizationStatus };
  }

  if (score > 80) {
    await enablePremiumFeatures(cid);
  }

  return { score, monetizationStatus, phase4Trust };
}

async function isPhase4MonetizationBlocked(creatorId) {
  if (process.env.CREATOR_TRUST_PHASE4_ENFORCEMENT !== 'true') return false;
  const cid = creatorId?.toString?.() || creatorId;
  const doc = await db.CreatorReputation.findOne({ creatorId: cid }).select('phase4Trust').lean();
  const s = doc?.phase4Trust?.score;
  if (s == null) return false;
  return Number(s) < 0;
}

module.exports = {
  calculateCreatorMonetizationTrustScore,
  gatherPhase4Inputs,
  computePhase4Trust,
  applyPhase4Enforcement,
  disableMonetization,
  enablePremiumFeatures,
  clearPhase4MonetizationSuppression,
  isPhase4MonetizationBlocked,
};
