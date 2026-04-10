'use strict';
/**
 * Generic A/B assignment for API-layer ranking (e.g. simple `ranking.service` path).
 * Stable per user id string (Mongo ObjectId-safe); not `userId % 2` on strings.
 *
 * Env: RANKING_AB_TEST_ENABLED=true — split into arms A / B; when false, `getVariant` is always `A` (baseline).
 * Discovery For You uses `experiments.js` (FEED_RANK_AB_ENABLED) and `rankWeightOverrides` instead.
 * https://milloapp.com
 */

/** @returns {boolean} */
function isRankingAbTestEnabled() {
  return process.env.RANKING_AB_TEST_ENABLED === 'true';
}

/**
 * Deterministic 0/1 from user id (same scheme as `experiments.getExperimentBucket` checksum).
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {0|1}
 */
function stableUserParity(userId) {
  const id = userId != null ? String(userId) : '';
  const code = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return code % 2 === 0 ? 0 : 1;
}

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @returns {'A'|'B'}
 */
function getVariant(userId) {
  if (!isRankingAbTestEnabled()) return 'A';
  return stableUserParity(userId) === 0 ? 'A' : 'B';
}

/**
 * Likes weight for simple scoreVideo A/B (example: A=3, B=5).
 * @param {'A'|'B'} variant
 * @returns {number}
 */
function getLikesWeightForVariant(variant) {
  return variant === 'B' ? 5 : 3;
}

module.exports = {
  isRankingAbTestEnabled,
  stableUserParity,
  getVariant,
  getLikesWeightForVariant,
};
