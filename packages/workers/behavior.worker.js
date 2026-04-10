'use strict';
/**
 * Behavior feature extraction — mouse path, clicks, keystroke *timing* variance.
 * Consumed by API enforcement; runnable as a worker if wired to Kafka later.
 * https://milloapp.com
 */

/**
 * Mean Euclidean distance (px) between consecutive mouse samples.
 * @param {Array<{ x?: number, y?: number, t?: number }>} moves
 */
function calculateMouseMeanSegmentLength(moves) {
  if (!Array.isArray(moves) || moves.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < moves.length; i++) {
    const dx = Number(moves[i].x) - Number(moves[i - 1].x);
    const dy = Number(moves[i].y) - Number(moves[i - 1].y);
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total / (moves.length - 1);
}

/**
 * Population variance of inter-key intervals (ms). Keys must be `{ t }` only.
 * @param {Array<{ t?: number }>} keys
 */
function keystrokeIntervalVariance(keys) {
  if (!Array.isArray(keys) || keys.length < 2) return 0;
  const intervals = [];
  for (let i = 1; i < keys.length; i++) {
    const dt = Number(keys[i].t) - Number(keys[i - 1].t);
    if (Number.isFinite(dt) && dt >= 0 && dt < 60000) intervals.push(dt);
  }
  if (intervals.length === 0) return 0;
  if (intervals.length === 1) return 0;
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / intervals.length;
}

/**
 * @param {{ mouseMoves?: unknown[], clicks?: unknown[], keystrokes?: unknown[] }} data
 */
function extractFeatures(data) {
  const mouseMoves = Array.isArray(data?.mouseMoves) ? data.mouseMoves : [];
  const clicks = Array.isArray(data?.clicks) ? data.clicks : [];
  const keystrokes = Array.isArray(data?.keystrokes) ? data.keystrokes : [];

  return {
    /** Average pixels between consecutive mouse samples (bot-like if many samples but ~0 movement). */
    mouseMeanSegmentPx: calculateMouseMeanSegmentLength(mouseMoves),
    mouseSampleCount: mouseMoves.length,
    clickCount: clicks.length,
    keystrokeIntervalVariance: keystrokeIntervalVariance(keystrokes),
    keystrokeSampleCount: keystrokes.length,
  };
}

module.exports = {
  extractFeatures,
  calculateMouseMeanSegmentLength,
  keystrokeIntervalVariance,
};
