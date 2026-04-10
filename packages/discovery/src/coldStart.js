'use strict';
/**
 * Creator fairness + user cold start — avoid only rewarding incumbents.
 * https://milloapp.com
 */

/** Default exploration fraction for cold users (30–40% band). Env: COLD_USER_EXPLORATION_RATIO */
const _envExp = Number(process.env.COLD_USER_EXPLORATION_RATIO);
const COLD_USER_EXPLORATION_RATIO =
  Number.isFinite(_envExp) && _envExp >= 0.2 && _envExp <= 0.45 ? _envExp : 0.35;

/** Incumbent exploration band (~10–20%) when user is not cold. */
const DEFAULT_EXPLORATION_RATIO = 0.15;

/**
 * Boost new content with little exposure (helps creators in first 24h).
 * @param {object} item - ContentFeatures-shaped
 * @returns {number}
 */
function creatorColdStartBoost(item) {
  const raw = item?.createdAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return 0;
  const ageHours = (Date.now() - t) / 3600000;
  const lowExposure = (item.ctr24h || 0) < 0.05 && (item.avgWatchTime24h || 0) < 3;
  if (ageHours < 24 && lowExposure) return 0.12;
  return 0;
}

/**
 * True when the viewer has little history — weight locale/region, broaden feed, raise exploration.
 * Uses onboarding signals (`categoryAffinityTop`) when present.
 * @param {object|null|undefined} userProfile - UserProfileFeatures lean
 * @returns {boolean}
 */
function isUserColdStart(userProfile) {
  if (!userProfile || typeof userProfile !== 'object') return false;
  const ageDays = Number(userProfile.accountAgeDays);
  const follows = Number(userProfile.followsCount);
  const watch7d = Number(userProfile.avgWatchTime7d);
  const affinities = userProfile.categoryAffinityTop;
  const hasAffinities = Array.isArray(affinities) && affinities.length > 0;

  if (Number.isFinite(ageDays) && ageDays <= 7) return true;
  if (Number.isFinite(follows) && follows < 8) return true;
  if (Number.isFinite(watch7d) && watch7d > 0 && watch7d < 5) return true;
  if (Number.isFinite(ageDays) && ageDays <= 14 && !hasAffinities) return true;
  return false;
}

/**
 * Exploration ratio for injectExploration / feed assembly.
 * @param {object|null|undefined} userProfile
 * @returns {number}
 */
function getColdStartExplorationRatio(userProfile) {
  return isUserColdStart(userProfile) ? COLD_USER_EXPLORATION_RATIO : DEFAULT_EXPLORATION_RATIO;
}

/**
 * Whether a scored row is a good exploration candidate (fresh / cold creator / bonus).
 * @param {{ features?: object, scores?: object }} row
 * @returns {boolean}
 */
function isExploreCandidateRow(row) {
  const f = row?.features || {};
  const s = row?.scores || {};
  if ((s.explorationBonus || 0) > 0) return true;
  if ((f.pair_creator_cold_start_boost || 0) > 0) return true;
  if ((f.pair_age_hours || 999) < 24) return true;
  return false;
}

module.exports = {
  creatorColdStartBoost,
  isUserColdStart,
  getColdStartExplorationRatio,
  isExploreCandidateRow,
  COLD_USER_EXPLORATION_RATIO,
  DEFAULT_EXPLORATION_RATIO,
};
