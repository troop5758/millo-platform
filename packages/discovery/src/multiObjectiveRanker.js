'use strict';
/**
 * Multi-objective feed score — TikTok-style weighted objective (docs/discovery-recommendation-pipeline.md).
 * Pure function: plug in model outputs (probabilities / normalized signals) as they become available.
 * https://milloapp.com
 */

/** Default weights — tune via experiments. */
const MULTI_OBJECTIVE_WEIGHTS = Object.freeze({
  p_long_watch: 1.2,
  expected_watch_time: 0.9,
  p_like: 0.65,
  p_share: 0.55,
  p_follow: 0.75,
  p_gift_or_buy: 1.1,
  freshness_score: 0.4,
  exploration_bonus: 0.25,
  p_fast_skip: 1.3,
  p_report: 2.5,
  policy_risk_penalty: 1.1,
});

/**
 * @typedef {object} MultiObjectiveSignals
 * @property {number} [p_long_watch] P(qualified / long watch), [0,1]
 * @property {number} [expected_watch_time] Normalized expected watch (e.g. [0,1]); see pipeline doc
 * @property {number} [p_like]
 * @property {number} [p_share]
 * @property {number} [p_follow]
 * @property {number} [p_gift_or_buy] Gift / purchase / subscription propensity
 * @property {number} [freshness_score]
 * @property {number} [exploration_bonus] Bandit / exploration uplift
 * @property {number} [p_fast_skip]
 * @property {number} [p_report]
 * @property {number} [policy_risk_penalty] Compliance / safety risk in [0,1] or scaled
 */

function n(x, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Weighted multi-objective score for a single candidate after models produce signals.
 * @param {MultiObjectiveSignals} signals
 * @param {Partial<typeof MULTI_OBJECTIVE_WEIGHTS>} [weights]
 * @returns {{ finalScore: number, breakdown: Record<string, number> }}
 */
function computeFinalFeedScore(signals = {}, weights = {}) {
  const w = { ...MULTI_OBJECTIVE_WEIGHTS, ...weights };
  const s = {
    p_long_watch: n(signals.p_long_watch),
    expected_watch_time: n(signals.expected_watch_time),
    p_like: n(signals.p_like),
    p_share: n(signals.p_share),
    p_follow: n(signals.p_follow),
    p_gift_or_buy: n(signals.p_gift_or_buy),
    freshness_score: n(signals.freshness_score),
    exploration_bonus: n(signals.exploration_bonus),
    p_fast_skip: n(signals.p_fast_skip),
    p_report: n(signals.p_report),
    policy_risk_penalty: n(signals.policy_risk_penalty),
  };

  const pos =
    w.p_long_watch * s.p_long_watch +
    w.expected_watch_time * s.expected_watch_time +
    w.p_like * s.p_like +
    w.p_share * s.p_share +
    w.p_follow * s.p_follow +
    w.p_gift_or_buy * s.p_gift_or_buy +
    w.freshness_score * s.freshness_score +
    w.exploration_bonus * s.exploration_bonus;

  const neg =
    w.p_fast_skip * s.p_fast_skip +
    w.p_report * s.p_report +
    w.policy_risk_penalty * s.policy_risk_penalty;

  const breakdown = {
    term_p_long_watch: w.p_long_watch * s.p_long_watch,
    term_expected_watch_time: w.expected_watch_time * s.expected_watch_time,
    term_p_like: w.p_like * s.p_like,
    term_p_share: w.p_share * s.p_share,
    term_p_follow: w.p_follow * s.p_follow,
    term_p_gift_or_buy: w.p_gift_or_buy * s.p_gift_or_buy,
    term_freshness: w.freshness_score * s.freshness_score,
    term_exploration: w.exploration_bonus * s.exploration_bonus,
    term_p_fast_skip: -w.p_fast_skip * s.p_fast_skip,
    term_p_report: -w.p_report * s.p_report,
    term_policy_risk: -w.policy_risk_penalty * s.policy_risk_penalty,
  };

  return { finalScore: pos - neg, breakdown };
}

module.exports = {
  MULTI_OBJECTIVE_WEIGHTS,
  computeFinalFeedScore,
};
