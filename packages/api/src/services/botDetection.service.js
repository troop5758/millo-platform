'use strict';
/**
 * Heuristic bot scoring from behavior feature vector (see workers/behavior.worker.js).
 * Tunable via env. https://milloapp.com
 */

const MOUSE_SEGMENTS_MIN = Number(process.env.BEHAVIOR_BOT_MOUSE_SAMPLES_MIN) || 8;
/** Below this mean segment length (px) with enough samples → bot-like stillness / synthetic path. */
const MOUSE_MEAN_SEG_MAX = Number(process.env.BEHAVIOR_BOT_MOUSE_MEAN_SEG_MAX) || 2;
const MOUSE_BOT_WEIGHT = Number(process.env.BEHAVIOR_BOT_MOUSE_SCORE) || 40;

const KEYSTROKE_MIN = Number(process.env.BEHAVIOR_BOT_KEYSTROKE_SAMPLES_MIN) || 4;
/** Below this variance (ms²) on intervals → robotic typing. */
const KEYSTROKE_VAR_MAX = Number(process.env.BEHAVIOR_BOT_KEYSTROKE_VAR_MAX) || 5;
const KEYSTROKE_BOT_WEIGHT = Number(process.env.BEHAVIOR_BOT_KEYSTROKE_SCORE) || 30;

const CLICKS_MAX = Number(process.env.BEHAVIOR_BOT_CLICKS_MAX) || 100;
const CLICKS_BOT_WEIGHT = Number(process.env.BEHAVIOR_BOT_CLICKS_SCORE) || 20;

/** @param {object} features */
function detectBot(features) {
  if (!features || typeof features !== 'object') return 0;
  let score = 0;

  if (
    features.mouseSampleCount >= MOUSE_SEGMENTS_MIN
    && features.mouseMeanSegmentPx < MOUSE_MEAN_SEG_MAX
  ) {
    score += MOUSE_BOT_WEIGHT;
  }

  if (
    features.keystrokeSampleCount >= KEYSTROKE_MIN
    && features.keystrokeIntervalVariance < KEYSTROKE_VAR_MAX
  ) {
    score += KEYSTROKE_BOT_WEIGHT;
  }

  if (Number(features.clickCount) > CLICKS_MAX) {
    score += CLICKS_BOT_WEIGHT;
  }

  return score;
}

module.exports = {
  detectBot,
};
