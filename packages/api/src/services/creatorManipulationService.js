'use strict';
/**
 * Creator Manipulation Detection — penalize creators who repeatedly post manipulated content.
 * Example rule: 5+ manipulated videos within 7 days → reduce creator reach, remove monetization eligibility.
 * "Manipulated" = content with Content Authenticity Score below threshold (default 40).
 * https://milloapp.com
 */
const db = require('@millo/database');

const WINDOW_DAYS = Number(process.env.CREATOR_MANIPULATION_WINDOW_DAYS) || 7;
const COUNT_THRESHOLD = Number(process.env.CREATOR_MANIPULATION_COUNT_THRESHOLD) || 5;
const MANIPULATED_SCORE_MAX = Number(process.env.CREATOR_MANIPULATION_SCORE_MAX) || 40; // score < this = manipulated
const REACH_MULTIPLIER_PENALIZED = Number(process.env.CREATOR_MANIPULATION_REACH_MULTIPLIER) || 0.2;

/**
 * Count creator's content (streams) with authenticityScore below threshold within the window.
 * @param {string|ObjectId} creatorId
 * @param {number} [windowDays]
 * @param {number} [scoreThreshold] - content with score < this is "manipulated"
 * @returns {Promise<number>}
 */
async function getManipulatedContentCount(creatorId, windowDays = WINDOW_DAYS, scoreThreshold = MANIPULATED_SCORE_MAX) {
  const cid = creatorId?.toString?.() || creatorId;
  if (!cid) return 0;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const streams = await db.LiveStream.find({ userId: cid, createdAt: { $gte: since } })
    .select('_id')
    .lean();
  const contentIds = streams.map((s) => s._id.toString());
  if (contentIds.length === 0) return 0;
  const count = await db.ContentAuthenticity.countDocuments({
    contentId: { $in: contentIds },
    contentType: 'livestream',
    authenticityScore: { $lt: scoreThreshold },
  });
  return count;
}

/**
 * Whether the creator is currently penalized (5+ manipulated content in 7 days).
 */
async function isCreatorManipulationPenalized(creatorId) {
  const count = await getManipulatedContentCount(creatorId);
  return count >= COUNT_THRESHOLD;
}

/**
 * Feed/reach multiplier when creator is penalized (default 0.2). Normal creators return 1.
 * Use with ghost ban: finalReachMultiplier = ghostBanMultiplier * getCreatorReachMultiplier(creatorId).
 */
async function getCreatorReachMultiplier(creatorId) {
  const penalized = await isCreatorManipulationPenalized(creatorId);
  return penalized ? REACH_MULTIPLIER_PENALIZED : 1;
}

/**
 * Whether the creator is eligible for monetization (payouts, etc.). False when penalized for manipulation.
 */
async function isMonetizationEligible(creatorId) {
  const penalized = await isCreatorManipulationPenalized(creatorId);
  return !penalized;
}

module.exports = {
  getManipulatedContentCount,
  isCreatorManipulationPenalized,
  getCreatorReachMultiplier,
  isMonetizationEligible,
  WINDOW_DAYS,
  COUNT_THRESHOLD,
  MANIPULATED_SCORE_MAX,
  REACH_MULTIPLIER_PENALIZED,
};
