'use strict';
/**
 * Compare current batch features to a historical baseline profile.
 * https://milloapp.com
 */

const MOUSE_DELTA = Number(process.env.BEHAVIOR_ANOMALY_MOUSE_DELTA_PX) || 80;
const CLICK_DELTA = Number(process.env.BEHAVIOR_ANOMALY_CLICK_DELTA) || 50;
const VAR_DELTA = Number(process.env.BEHAVIOR_ANOMALY_KEYSTROKE_VAR_DELTA) || 120;

const MOUSE_ANOMALY_SCORE = Number(process.env.BEHAVIOR_ANOMALY_MOUSE_SCORE) || 40;
const CLICK_ANOMALY_SCORE = Number(process.env.BEHAVIOR_ANOMALY_CLICK_SCORE) || 30;
const VAR_ANOMALY_SCORE = Number(process.env.BEHAVIOR_ANOMALY_VAR_SCORE) || 25;

/**
 * @param {object} current — from extractFeatures
 * @param {object|null} baseline — from buildBehaviorProfile
 * @returns {number}
 */
function detectBehaviorAnomaly(current, baseline) {
  if (!baseline || !current) return 0;
  let score = 0;

  if (
    Math.abs(Number(current.mouseMeanSegmentPx) - Number(baseline.mouseMeanSegmentPx)) > MOUSE_DELTA
  ) {
    score += MOUSE_ANOMALY_SCORE;
  }

  if (Math.abs(Number(current.clickCount) - Number(baseline.clickCount)) > CLICK_DELTA) {
    score += CLICK_ANOMALY_SCORE;
  }

  if (
    Math.abs(
      Number(current.keystrokeIntervalVariance) - Number(baseline.keystrokeIntervalVariance)
    ) > VAR_DELTA
  ) {
    score += VAR_ANOMALY_SCORE;
  }

  return score;
}

module.exports = {
  detectBehaviorAnomaly,
};
