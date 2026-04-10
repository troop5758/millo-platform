/**
 * AI optimization config — production defaults ON; explicit `AI_OPTIMIZATION_ENABLED=false` = emergency kill-switch.
 * Non-production: opt-in via `AI_OPTIMIZATION_ENABLED=true` (safe local default).
 * Shadow mode (AI_SHADOW_MODE=true) keeps suggest* APIs advisory only and disables ranking/ads injection.
 * https://milloapp.com
 */
function isProductionNodeEnv() {
  return process.env.NODE_ENV === 'production';
}

function getAiOptimizationEnabled() {
  if (isProductionNodeEnv()) return process.env.AI_OPTIMIZATION_ENABLED !== 'false';
  return process.env.AI_OPTIMIZATION_ENABLED === 'true';
}

/** True when ranking should add AI bump in discovery (not shadow, not killed). */
function shouldApplyRankingInjection() {
  if (!getAiOptimizationEnabled()) return false;
  if (process.env.AI_SHADOW_MODE === 'true') return false;
  if (process.env.AI_RANKING_INJECTION_ENABLED === 'false') return false;
  return true;
}

/** True when ads delivery should apply AI bid/timing/audience heuristics. */
function shouldApplyAdsOptimization() {
  if (!getAiOptimizationEnabled()) return false;
  if (process.env.ADS_ENABLED === 'false') return false;
  if (process.env.AI_ADS_OPTIMIZATION_ENABLED === 'false') return false;
  if (process.env.AI_SHADOW_MODE === 'true') return false;
  return true;
}

function getAiRankScoreWeight() {
  const w = Number(process.env.AI_RANK_SCORE_WEIGHT);
  return Number.isFinite(w) && w >= 0 ? w : 0.3;
}

module.exports = {
  getAiOptimizationEnabled,
  shouldApplyRankingInjection,
  shouldApplyAdsOptimization,
  getAiRankScoreWeight,
};
