'use strict';
/**
 * Ghost Banning System — stealth restrictions instead of instant ban.
 * Feed suppression, comment invisibility, live discoverability limit, DM rate limit.
 * Example: if user.trustScore < 40, rankingScore = rankingScore * 0.1
 * https://milloapp.com
 */
const moderationService = require('./moderationService');
const trustScoreEngine = require('./trustScoreEngine');
const creatorManipulationService = require('./creatorManipulationService');
const creatorReputationService = require('./creatorReputationService');

const FEED_SUPPRESSION_THRESHOLD = Number(process.env.GHOST_BAN_FEED_THRESHOLD) || 40;
const FEED_MULTIPLIER_LOW = Number(process.env.GHOST_BAN_FEED_MULTIPLIER_LOW) || 0.1;
const FEED_MULTIPLIER_MED = Number(process.env.GHOST_BAN_FEED_MULTIPLIER_MED) || 0.5;
const COMMENT_INVISIBLE_THRESHOLD = Number(process.env.GHOST_BAN_COMMENT_THRESHOLD) || 40;
const LIVE_DISCOVERABILITY_MULTIPLIER_BELOW = Number(process.env.GHOST_BAN_LIVE_DISCOVERABILITY) || 0.2;
const DM_RATE_LIMIT_PER_HOUR = Number(process.env.GHOST_BAN_DM_PER_HOUR) || 5;

/**
 * Get feed ranking multiplier for a creator (0 = fully suppressed, 0.1 = heavy suppression, 1 = normal).
 * Shadow-banned => 0. Trust score < 40 => 0.1. Trust score < 60 => 0.5. Else 1.
 * Creator manipulation penalty (5+ manipulated content in 7 days) multiplies result by 0.2.
 */
async function getFeedRankingMultiplier(userId) {
  if (!userId) return 0;
  const shadowBanned = await moderationService.isShadowBanned(userId);
  if (shadowBanned) return 0;
  const { score } = await trustScoreEngine.getTrustScore(userId);
  let mult = 1;
  if (score < FEED_SUPPRESSION_THRESHOLD) mult = FEED_MULTIPLIER_LOW;
  else if (score < 60) mult = FEED_MULTIPLIER_MED;
  const reachMult = await creatorManipulationService.getCreatorReachMultiplier(userId);
  const crsPromo = await creatorReputationService.getAlgorithmicPromotionMultiplier(userId);
  return mult * reachMult * crsPromo;
}

/**
 * Whether this user's content/comments should be hidden from feeds (comment invisibility, feed suppression).
 */
async function shouldHideFromFeed(userId) {
  if (!userId) return true;
  const shadowBanned = await moderationService.isShadowBanned(userId);
  if (shadowBanned) return true;
  const { score } = await trustScoreEngine.getTrustScore(userId);
  return score < COMMENT_INVISIBLE_THRESHOLD;
}

/**
 * Whether to hide this commenter's comments (comment invisibility).
 */
async function shouldHideComment(commenterUserId) {
  return shouldHideFromFeed(commenterUserId);
}

/**
 * Batch: which user IDs should have comments hidden. Returns Set of userId strings.
 */
async function getCommentHiddenUserIds(userIds) {
  if (!userIds?.length) return new Set();
  const hidden = new Set();
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const hide = await shouldHideComment(uid);
        if (hide) hidden.add(uid?.toString?.() || uid);
      } catch (_) {}
    })
  );
  return hidden;
}

/**
 * Live discoverability multiplier (0–1). Low-trust streams get fewer viewers in discovery.
 * Creator manipulation penalty reduces reach.
 */
async function getLiveDiscoverabilityMultiplier(userId) {
  if (!userId) return 0;
  const shadowBanned = await moderationService.isShadowBanned(userId);
  if (shadowBanned) return 0;
  const { score } = await trustScoreEngine.getTrustScore(userId);
  let mult = 1;
  if (score < FEED_SUPPRESSION_THRESHOLD) mult = LIVE_DISCOVERABILITY_MULTIPLIER_BELOW;
  else if (score < 60) mult = FEED_MULTIPLIER_MED;
  const reachMult = await creatorManipulationService.getCreatorReachMultiplier(userId);
  const crsPromo = await creatorReputationService.getAlgorithmicPromotionMultiplier(userId);
  return mult * reachMult * crsPromo;
}

/**
 * DM rate limit for ghost-banned users: max messages per hour. Returns { limit: number, windowMs: number }.
 * Normal users use default route rate limit; ghost-banned get stricter limit (e.g. 5/hour).
 */
async function getDmRateLimit(senderUserId) {
  const ok = await shouldHideFromFeed(senderUserId);
  if (ok) {
    return { limit: DM_RATE_LIMIT_PER_HOUR, windowMs: 60 * 60 * 1000 };
  }
  return null;
}

/**
 * Check if sender has exceeded ghost-ban DM limit (messages in last hour).
 */
async function isDmRateLimitExceeded(senderUserId) {
  const limitConfig = await getDmRateLimit(senderUserId);
  if (!limitConfig) return false;
  const db = require('@millo/database');
  const since = new Date(Date.now() - limitConfig.windowMs);
  const count = await db.DMMessage.countDocuments({
    senderId: senderUserId,
    createdAt: { $gte: since },
    deletedAt: null,
  });
  return count >= limitConfig.limit;
}

module.exports = {
  getFeedRankingMultiplier,
  shouldHideFromFeed,
  shouldHideComment,
  getCommentHiddenUserIds,
  getLiveDiscoverabilityMultiplier,
  getDmRateLimit,
  isDmRateLimitExceeded,
};
