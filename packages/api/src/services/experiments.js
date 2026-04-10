'use strict';
/**
 * Feed ranking A/B hooks (Part 18) — stable bucket per user; weights applied in @millo/discovery `scoreFeatures`.
 * Uplift (watch time, retention, negative feedback, monetization, creator fairness) is computed in the warehouse
 * by joining `experimentBucket` on `rank.predictions` + `feed.*` + sessions.
 *
 * Env: FEED_RANK_AB_ENABLED=true — split users into rank_v1 / rank_v2; default off (single control arm).
 * Simple realtime ranker A/B (likes weight): `abtest.js` + RANKING_AB_TEST_ENABLED.
 * https://milloapp.com
 */

/** @returns {boolean} */
function isFeedRankAbEnabled() {
  return process.env.FEED_RANK_AB_ENABLED === 'true';
}

/**
 * Deterministic 50/50 split from user id (stable across requests).
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {'rank_v1'|'rank_v2'}
 */
function getExperimentBucket(userId) {
  const id = userId != null ? String(userId) : '';
  const code = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return code % 2 === 0 ? 'rank_v1' : 'rank_v2';
}

/**
 * Partial overrides for `DEFAULT_FEED_RANK_WEIGHTS` (@millo/discovery ranker). Keep v1 aligned with defaults.
 * @param {'rank_v1'|'rank_v2'|'control'|string} bucket
 * @returns {Partial<Record<'wLongWatch'|'wLike'|'wShare'|'wFollow'|'wFreshness'|'wExplore'|'wFastSkip'|'wTrustPenalty', number>>|undefined}
 */
function getRankWeightOverridesForBucket(bucket) {
  const b = bucket != null ? String(bucket) : '';
  if (b === 'rank_v2') {
    return {
      wLongWatch: 1.35,
      wFollow: 0.9,
      wExplore: 0.32,
      wFastSkip: -1.45,
    };
  }
  return undefined;
}

/**
 * Context to pass into `buildForYouFeed({ context })`.
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {{ experimentBucket: string, rankWeightOverrides: object|undefined }}
 */
function getFeedRankExperimentContext(userId) {
  if (!isFeedRankAbEnabled()) {
    return { experimentBucket: 'control', rankWeightOverrides: undefined };
  }
  const bucket = getExperimentBucket(userId);
  return {
    experimentBucket: bucket,
    rankWeightOverrides: getRankWeightOverridesForBucket(bucket),
  };
}

module.exports = {
  isFeedRankAbEnabled,
  getExperimentBucket,
  getRankWeightOverridesForBucket,
  getFeedRankExperimentContext,
};
