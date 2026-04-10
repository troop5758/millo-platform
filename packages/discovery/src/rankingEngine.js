'use strict';
/**
 * Phase 7 — Ranking Engine. Multi-signal scoring for discovery.
 * Inputs: watch time, likes, shares, comments, follows, purchase activity, region popularity, creator reputation.
 * https://milloapp.com
 */
const { computeScore } = require('./ranking');

function aiRankingBump(item, options) {
  try {
    const mod = require('@millo/ai-optimization');
    if (typeof mod.getRankingScoreBump === 'function') return mod.getRankingScoreBump(item, options);
  } catch {
    /* optional workspace dep missing in minimal installs */
  }
  return 0;
}

// Kafka-driven discovery worker (Redis) uses the same weights — see discoveryRankingRedis.
// Fallback / DB-only growth: views*0.3 + likes*0.5 + watchTime*0.2
const CORE_GROWTH_WEIGHTS = {
  views: 0.3,
  likes: 0.5,
  watchTime: 0.2,
};

const WEIGHTS = {
  watchTime: 0.12,
  likes: 0.08,
  shares: 0.10,
  comments: 0.06,
  follows: 0.05,
  purchaseActivity: 0.08,
  ppvConversion: 0.14,
  giftRevenue: 0.12,
  subscriptionConversion: 0.10,
  viewerRetention: 0.08,
  regionPopularity: 0.04,
  creatorReputation: 0.13,
};

/**
 * Compute Phase 7 multi-signal score. Boosts content with high monetization engagement.
 * Phase 8 core growth ranking:
 *   growth = views*0.3 + likes*0.5 + watchTime*0.2
 * When `discoveryRedisRankScore` is set (Kafka→Redis worker), that value is used as growth instead of recomputing from DB fields.
 * Additional enterprise signals remain as secondary boosts.
 */
function computeDiscoveryScore(item, options = {}) {
  const base = computeScore(item, options);
  const views = Number(item.views ?? item.viewCount ?? item.viewerCount ?? item.viewers ?? 0) || 0;
  const likesRaw = Number(item.likes ?? item.likeCount ?? 0) || 0;
  const watchTimeRaw = Number(item.watchTime ?? item.watchTimeSeconds ?? 0) || 0;
  const redisGrowth = Number(item.discoveryRedisRankScore);
  const growthScore = Number.isFinite(redisGrowth) && redisGrowth >= 0
    ? redisGrowth
    : (
      views * CORE_GROWTH_WEIGHTS.views +
      likesRaw * CORE_GROWTH_WEIGHTS.likes +
      watchTimeRaw * CORE_GROWTH_WEIGHTS.watchTime
    );

  const wt = Math.min(1, watchTimeRaw / 3600) * (WEIGHTS.watchTime * 100);
  const likes = Math.min(1, likesRaw / 100) * (WEIGHTS.likes * 100);
  const shares = Math.min(1, (item.shares || 0) / 50) * (WEIGHTS.shares * 100);
  const comments = Math.min(1, (item.comments || 0) / 50) * (WEIGHTS.comments * 100);
  const follows = Math.min(1, (item.creatorFollowers || 0) / 1000) * (WEIGHTS.follows * 100);
  const purchase = Math.min(1, (item.purchaseCount || 0) / 20) * (WEIGHTS.purchaseActivity * 100);
  const ppvConv = (item.ppvConversion ?? 0) * (WEIGHTS.ppvConversion * 100);
  const giftRev = Math.min(1, (item.giftRevenueCents || 0) / 50000) * (WEIGHTS.giftRevenue * 100);
  const subConv = (item.subscriptionConversion ?? 0) * (WEIGHTS.subscriptionConversion * 100);
  const retention = Math.min(1, watchTimeRaw / 1800) * (WEIGHTS.viewerRetention * 100);
  const region = (item.regionPopularity || 0) * WEIGHTS.regionPopularity * 100;
  const reputation = (item.creatorReputation || 0) * WEIGHTS.creatorReputation;
  return base + growthScore + wt + likes + shares + comments + follows + purchase + ppvConv + giftRev + subConv + retention + region + reputation;
}

/** Shadow-ban multiplier: reduce visibility instead of removing (videos never reach FYP). */
const SHADOW_BAN_RANK_MULTIPLIER = Number(process.env.SHADOW_BAN_RANK_MULTIPLIER) || 0.05;

/**
 * Rank items with Phase 7 discovery scoring. Shadow-banned creators get score * 0.05 so they rarely reach FYP.
 */
function rankDiscovery(items, options = {}) {
  const mult = options.respectShadowBan !== false ? SHADOW_BAN_RANK_MULTIPLIER : 1;
  return items
    .map((item) => {
      const discoveryBase = computeDiscoveryScore(item, options);
      const aiBump = aiRankingBump(item, options);
      const combined = discoveryBase + aiBump;
      const rankingScore = item.shadowBanned ? combined * mult : combined;
      return { ...item, _score: rankingScore, _aiRankBump: aiBump };
    })
    .sort((a, b) => {
      const diff = b._score - a._score;
      if (diff !== 0) return diff;
      return String(a.id || a._id || '').localeCompare(String(b.id || b._id || ''));
    });
}

module.exports = { computeDiscoveryScore, rankDiscovery, WEIGHTS };
