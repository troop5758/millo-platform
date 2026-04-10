'use strict';
/**
 * Live discovery ranking — score live streams for trending (watchTime, giftRevenue, chatCount, viewers, creatorTrustScore).
 * https://milloapp.com
 */
const db = require('@millo/database');
const creatorReputationService = require('./creatorReputationService');

const WEIGHT_WATCH_TIME = Number(process.env.LIVE_RANKING_WEIGHT_WATCH_TIME) || 0.4;
const WEIGHT_GIFT_REVENUE = Number(process.env.LIVE_RANKING_WEIGHT_GIFT_REVENUE) || 0.25;
const WEIGHT_CHAT_COUNT = Number(process.env.LIVE_RANKING_WEIGHT_CHAT_COUNT) || 0.15;
const WEIGHT_VIEWERS = Number(process.env.LIVE_RANKING_WEIGHT_VIEWERS) || 0.1;
const WEIGHT_CREATOR_TRUST = Number(process.env.LIVE_RANKING_WEIGHT_CREATOR_TRUST) || 0.1;

const DEFAULT_CREATOR_TRUST_NORMALIZED = 0.5;

/**
 * Calculate a single live stream score for ranking.
 * @param {object} live — stream doc with viewerCount, totalGiftCoins, meta (optional watchTime, chatCount), userId (creator)
 * @param {number} creatorTrustNormalized — 0–1 (e.g. CreatorReputation score / 100)
 * @returns {number} score (higher = more trending)
 */
function calculateLiveScore(live, creatorTrustNormalized = DEFAULT_CREATOR_TRUST_NORMALIZED) {
  const watchTime = Number(live.meta?.watchTime) || 0;
  const giftRevenue = Number(live.totalGiftCoins) ?? 0;
  const chatCount = Number(live.meta?.chatCount) || 0;
  const viewers = Number(live.viewerCount) ?? 0;
  const trust = Math.max(0, Math.min(1, Number(creatorTrustNormalized) || DEFAULT_CREATOR_TRUST_NORMALIZED));

  return (
    watchTime * WEIGHT_WATCH_TIME +
    giftRevenue * WEIGHT_GIFT_REVENUE +
    chatCount * WEIGHT_CHAT_COUNT +
    (viewers / 1000) * WEIGHT_VIEWERS +
    trust * WEIGHT_CREATOR_TRUST
  );
}

/**
 * Get trending live streams: status=live, scored and sorted by score desc.
 * Uses LiveStream fields; watchTime/chatCount from meta when present. Creator trust from CreatorReputation.
 * @param {object} opts — { limit, category, visibility }
 * @returns {Promise<Array<object>>} list of stream objects with score attached
 */
async function getTrendingLives(opts = {}) {
  const limit = Math.min(Math.max(1, Number(opts.limit) || 50), 100);
  const query = { status: 'live' };
  if (opts.category && String(opts.category).trim()) query.category = String(opts.category).trim();
  if (opts.visibility) query.visibility = opts.visibility;

  const lives = await db.LiveStream.find(query)
    .sort({ startedAt: -1 })
    .limit(limit * 2)
    .lean();

  if (lives.length === 0) return [];

  const creatorIds = [...new Set(lives.map((l) => l.userId?.toString?.() || l.userId).filter(Boolean))];
  const scoreMap = await creatorReputationService.getCreatorReputationScoreMap(creatorIds);

  const withScore = lives.map((live) => {
    const creatorId = live.userId?.toString?.() || live.userId;
    const crs = scoreMap.get(creatorId);
    const creatorTrustNormalized = crs != null ? Math.max(0, Math.min(100, Number(crs))) / 100 : DEFAULT_CREATOR_TRUST_NORMALIZED;
    const score = calculateLiveScore(live, creatorTrustNormalized);
    return { ...live, score };
  });

  withScore.sort((a, b) => (b.score !== a.score ? b.score - a.score : (b.startedAt || 0) - (a.startedAt || 0)));
  return withScore.slice(0, limit);
}

module.exports = { calculateLiveScore, getTrendingLives };
