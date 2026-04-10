'use strict';
/**
 * Lightweight heuristic ranker — sigmoid logits over `buildPairFeatures` output.
 * Replace later with XGBoost / LightGBM / TorchServe; keep the same feature dict contract.
 * Final linear layer weights are overridable per A/B bucket (Part 18).
 * https://milloapp.com
 */

/** Default multipliers on pLongWatch, pLike, … for `finalScore` (tune via experiments). */
const DEFAULT_FEED_RANK_WEIGHTS = Object.freeze({
  wLongWatch: 1.2,
  wLike: 0.65,
  wShare: 0.55,
  wFollow: 0.75,
  wFreshness: 0.4,
  wExplore: 0.25,
  wFastSkip: -1.3,
  wTrustPenalty: -0.02,
});

/**
 * @param {Partial<typeof DEFAULT_FEED_RANK_WEIGHTS>|null|undefined} partial
 * @returns {typeof DEFAULT_FEED_RANK_WEIGHTS}
 */
function mergeFeedRankWeights(partial) {
  if (!partial || typeof partial !== 'object') return { ...DEFAULT_FEED_RANK_WEIGHTS };
  return { ...DEFAULT_FEED_RANK_WEIGHTS, ...partial };
}

/**
 * @param {number} x
 * @returns {number}
 */
function sigmoid(x) {
  const z = Number(x);
  if (!Number.isFinite(z)) return 0.5;
  if (z >= 35) return 1;
  if (z <= -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

/**
 * @param {Record<string, number>} f - Output of `featureBuilder.buildPairFeatures`
 * @returns {{
 *   pLongWatch: number,
 *   pLike: number,
 *   pShare: number,
 *   pFollow: number,
 *   pFastSkip: number,
 *   freshnessScore: number,
 *   explorationBonus: number,
 *   finalScore: number
 * }}
 * @param {Partial<typeof DEFAULT_FEED_RANK_WEIGHTS>|null|undefined} [weightOverrides] - A/B bucket weights
 */
function scoreFeatures(f, weightOverrides) {
  const x = f && typeof f === 'object' ? f : {};
  const w = mergeFeedRankWeights(weightOverrides);
  const uCold = x.pair_user_cold_start || 0;

  const pLongWatch = sigmoid(
    -1.2 +
    0.03 * (x.user_avg_session_minutes_7d || 0) +
    -1.1 * (x.user_short_skip_rate_7d || 0) +
    0.9 * (x.item_completion_rate_24h || 0) +
    0.5 * (x.item_avg_watch_time_24h || 0) / 10 +
    0.3 * (x.pair_topic_overlap || 0) +
    0.4 * (x.pair_same_language || 0) +
    0.15 * (x.pair_follows_creator || 0) +
    0.5 * uCold * (x.pair_same_language || 0) +
    0.35 * uCold * (x.pair_same_region || 0)
  );

  const pLike = sigmoid(
    -1.8 +
    0.8 * (x.item_comment_rate_24h || 0) +
    1.0 * (x.item_share_rate_24h || 0) +
    0.4 * (x.pair_topic_overlap || 0)
  );

  const pShare = sigmoid(
    -2.4 +
    1.2 * (x.item_share_rate_24h || 0) +
    0.2 * (x.item_ctr_24h || 0) +
    0.3 * (x.pair_topic_overlap || 0)
  );

  const pFollow = sigmoid(
    -2.2 +
    1.1 * (x.item_follow_conversion_24h || 0) +
    0.3 * (x.pair_topic_overlap || 0) +
    0.2 * (x.creator_trust_score || 0) / 100
  );

  const pFastSkip = sigmoid(
    -0.7 +
    1.4 * (x.user_short_skip_rate_7d || 0) +
    0.7 * (x.item_negative_rate_24h || 0) +
    -0.2 * (x.pair_same_language || 0)
  );

  const freshnessScore = Math.max(0, 1 - Math.min((x.pair_age_hours || 1) / 72, 1));
  const explorationBonus = freshnessScore > 0.8 ? 0.15 : 0.0;

  const sessionTopicBoost = x.pair_session_topic_boost ?? 0;
  const sessionTypePenalty = x.pair_session_type_penalty ?? 0;
  const creatorColdBoost = x.pair_creator_cold_start_boost ?? 0;

  const finalScore =
    w.wLongWatch * pLongWatch +
    w.wLike * pLike +
    w.wShare * pShare +
    w.wFollow * pFollow +
    w.wFreshness * freshnessScore +
    w.wExplore * explorationBonus +
    w.wFastSkip * pFastSkip +
    w.wTrustPenalty * Math.max(0, -(x.creator_trust_score || 0)) +
    sessionTopicBoost +
    sessionTypePenalty +
    creatorColdBoost;

  return {
    pLongWatch,
    pLike,
    pShare,
    pFollow,
    pFastSkip,
    freshnessScore,
    explorationBonus,
    sessionTopicBoost,
    sessionTypePenalty,
    creatorColdBoost,
    finalScore,
  };
}

/**
 * Rank items by precomputed feature rows (or build from profile + items).
 * @param {Array<{ item: object, features: Record<string, number> }>} rows
 * @returns {Array<{ item: object, features: Record<string, number>, scores: ReturnType<typeof scoreFeatures> }>}
 */
function rankByHeuristicFeatures(rows, weightOverrides) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const scored = rows.map((row) => {
    const features = row.features || {};
    const scores = scoreFeatures(features, weightOverrides);
    return { ...row, features, scores };
  });
  scored.sort((a, b) => {
    const d = b.scores.finalScore - a.scores.finalScore;
    if (d !== 0) return d;
    const ida = String(a.item?.contentId ?? a.item?.id ?? '');
    const idb = String(b.item?.contentId ?? b.item?.id ?? '');
    return ida.localeCompare(idb);
  });
  return scored;
}

module.exports = {
  sigmoid,
  scoreFeatures,
  rankByHeuristicFeatures,
  DEFAULT_FEED_RANK_WEIGHTS,
  mergeFeedRankWeights,
};
