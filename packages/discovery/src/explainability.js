/**
 * Explainability — attach explanation to each ranked item.
 * https://milloapp.com
 */
const ranking = require('./ranking');
const { LEVEL_WEIGHT, TRUST_WEIGHT, ENGAGEMENT_WEIGHT, DEFAULT_BASE_SCORE } = require('./constants');

/**
 * Rank items and attach explanation for each.
 * explanation: { level, levelWeight, levelContribution, trust?, trustWeight?, trustContribution?, engagement?, engagementWeight?, engagementContribution?, baseScore, finalScore, shadowBanned, source? }
 */
function rankWithExplanation(items, options = {}) {
  const levelWeight = options.levelWeight ?? LEVEL_WEIGHT;
  const trustWeight = options.trustWeight ?? TRUST_WEIGHT;
  const engagementWeight = options.engagementWeight ?? ENGAGEMENT_WEIGHT;
  const filtered = (options.respectShadowBan !== false)
    ? items.filter((i) => !i.shadowBanned)
    : [...items];
  const withScore = filtered.map((item) => {
    const baseScore = item.baseScore ?? DEFAULT_BASE_SCORE;
    const level = Number(item.level) || 0;
    const trust = Number(item.trust) || 0;
    const engagement = ranking.computeEngagementScore(item);
    const levelContribution = levelWeight * level;
    const trustContribution = trustWeight * trust;
    const engagementContribution = engagementWeight * engagement;
    const finalScore = baseScore + levelContribution + trustContribution + engagementContribution;
    const explanation = {
      level,
      levelWeight,
      levelContribution,
      baseScore,
      finalScore,
      shadowBanned: false,
    };
    if (trust > 0 || item.trust !== undefined) {
      explanation.trust = trust;
      explanation.trustWeight = trustWeight;
      explanation.trustContribution = trustContribution;
    }
    if (engagement > 0 || item.likeCount !== undefined || item.shareCount !== undefined || item.commentCount !== undefined) {
      explanation.engagement = engagement;
      explanation.engagementWeight = engagementWeight;
      explanation.engagementContribution = engagementContribution;
    }
    if (options.source) explanation.source = options.source;
    return {
      ...item,
      _score: finalScore,
      explanation,
    };
  });
  const sorted = withScore.sort((a, b) => {
    const diff = b._score - a._score;
    if (diff !== 0) return diff;
    return String(a.id || a._id || '').localeCompare(String(b.id || b._id || ''));
  });
  return sorted;
}

/** Shorts ranking with explainability. */
function rankShortsWithExplanation(items, options = {}) {
  return rankWithExplanation(items, { ...options, source: 'shorts' });
}

/** Live ranking with explainability. */
function rankLiveWithExplanation(items, options = {}) {
  return rankWithExplanation(items, { ...options, source: 'live' });
}

module.exports = { rankWithExplanation, rankShortsWithExplanation, rankLiveWithExplanation };
