/**
 * Deterministic ranking with level and trust weighting. Shadow ban respected (excluded).
 * https://milloapp.com
 */
const { LEVEL_WEIGHT, TRUST_WEIGHT, ENGAGEMENT_WEIGHT, DEFAULT_BASE_SCORE } = require('./constants');

/**
 * Compute engagement score from likes, shares, comments. Normalized to avoid overflow.
 */
function computeEngagementScore(item) {
  const likes = Number(item.likeCount) || 0;
  const shares = Number(item.shareCount) || 0;
  const comments = Number(item.commentCount) || 0;
  if (item.engagementScore != null) return Number(item.engagementScore) || 0;
  return Math.log1p(likes * 2 + shares * 3 + comments);
}

/**
 * Compute single-item score. Deterministic: same inputs → same score.
 * score = baseScore + (levelWeight * level) + (trustWeight * trust) + (engagementWeight * engagement) + algorithmBoost
 */
function computeScore(item, options = {}) {
  const levelWeight = options.levelWeight ?? LEVEL_WEIGHT;
  const trustWeight = options.trustWeight ?? TRUST_WEIGHT;
  const engagementWeight = options.engagementWeight ?? ENGAGEMENT_WEIGHT;
  const base = item.baseScore ?? DEFAULT_BASE_SCORE;
  const level = Number(item.level) || 0;
  const trust = Number(item.trust) || 0;
  const engagement = computeEngagementScore(item);
  const algorithmBoost = Number(item.algorithmBoost) || 0;
  return base + levelWeight * level + trustWeight * trust + engagementWeight * engagement + algorithmBoost;
}

/**
 * Rank items deterministically. Items with shadowBanned: true are excluded.
 * Secondary sort by id for stable order when scores tie.
 */
function rank(items, options = {}) {
  const filtered = (options.respectShadowBan !== false)
    ? items.filter((i) => !i.shadowBanned)
    : [...items];
  return filtered
    .map((item) => ({
      ...item,
      _score: computeScore(item, options),
    }))
    .sort((a, b) => {
      const diff = b._score - a._score;
      if (diff !== 0) return diff;
      return String(a.id || a._id || '').localeCompare(String(b.id || b._id || ''));
    });
}

/** Shorts ranking: same engine with source for explainability. */
function rankShorts(items, options = {}) {
  return rank(items, { ...options, source: 'shorts' });
}

/** Live ranking: same engine with source for explainability. */
function rankLive(items, options = {}) {
  return rank(items, { ...options, source: 'live' });
}

module.exports = { computeScore, computeEngagementScore, rank, rankShorts, rankLive };
