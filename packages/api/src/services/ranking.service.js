'use strict';
/**
 * Simplified ranking core — interest profile × engagement × freshness.
 * For production discovery (filters, diversity, experiments) use `@millo/discovery` (`rankingEngine`, `feed.service`).
 * A/B likes weight: `abtest.getVariant` when `RANKING_AB_TEST_ENABLED=true`.
 * https://milloapp.com
 */

const { getVariant, getLikesWeightForVariant, isRankingAbTestEnabled } = require('./abtest');

/**
 * @param {Record<string, number>} userProfile — e.g. from `profile.service.buildUserProfile` (category → weight)
 * @param {{ category?: string, createdAt?: number|Date, id?: string }} video
 * @param {{ likes?: number, watchTime?: number }} signals
 * @param {{ variant?: 'A'|'B' }} [opts] — when `variant === 'B'` and `RANKING_AB_TEST_ENABLED=true`, likes use weight 5 vs 3
 * @returns {number}
 */
function scoreVideo(userProfile, video, signals, opts = {}) {
  const profile = userProfile && typeof userProfile === 'object' ? userProfile : {};
  const sig = signals && typeof signals === 'object' ? signals : {};
  const variant = opts.variant === 'B' ? 'B' : 'A';
  let score = 0;

  const rawCat = video?.category != null ? String(video.category) : '';
  const catLower = rawCat.toLowerCase();
  score += profile[catLower] ?? profile[rawCat] ?? 0;

  const likes = Number(sig.likes) || 0;
  const watchTime = Number(sig.watchTime) || 0;
  score += likes * getLikesWeightForVariant(variant);
  score += watchTime * 2;

  let createdMs;
  if (video?.createdAt != null) {
    createdMs = video.createdAt instanceof Date ? video.createdAt.getTime() : Number(video.createdAt);
  }
  if (!Number.isFinite(createdMs)) {
    createdMs = Date.now();
  }
  const age = Date.now() - createdMs;
  score -= age / 10000000;

  return score;
}

/**
 * @param {{ profile?: Record<string, number> }} user
 * @param {Array<object>} videos
 * @param {Record<string, { likes?: number, watchTime?: number }>} signalsMap — keyed by `video.id` or `video._id`
 * @returns {Array<object & { score: number }>}
 */
function rankFeed(user, videos, signalsMap) {
  const profile = user?.profile && typeof user.profile === 'object' ? user.profile : {};
  const list = Array.isArray(videos) ? videos : [];
  const map = signalsMap && typeof signalsMap === 'object' ? signalsMap : {};
  const variant = getVariant(user?._id);

  const tagVariant = isRankingAbTestEnabled();
  return list
    .map((v) => {
      const id = v?.id != null ? String(v.id) : v?._id != null ? String(v._id) : '';
      const signals = (id && map[id]) || {};
      const scored = scoreVideo(profile, v, signals, { variant });
      const row = { ...v, score: scored };
      if (tagVariant) row.abVariant = variant;
      return row;
    })
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  scoreVideo,
  rankFeed,
};
