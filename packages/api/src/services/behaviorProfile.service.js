'use strict';
/**
 * Aggregate recent feature vectors into a baseline “signature” for anomaly checks.
 * https://milloapp.com
 */

const path = require('path');
const { extractFeatures } = require(path.join(__dirname, '..', '..', '..', 'workers', 'behavior.worker.js'));
const { detectBehaviorAnomaly } = require('./behaviorAnomaly.service');
const db = require('@millo/database');

const BASELINE_LIMIT = Number(process.env.BEHAVIOR_BASELINE_SNAPSHOTS) || 10;

/**
 * @param {Array<Record<string, number>>} featuresList
 */
function buildBehaviorProfile(featuresList) {
  if (!Array.isArray(featuresList) || featuresList.length === 0) {
    return null;
  }
  const avg = (key) => featuresList.reduce((sum, f) => sum + (Number(f[key]) || 0), 0) / featuresList.length;
  return {
    mouseMeanSegmentPx: avg('mouseMeanSegmentPx'),
    clickCount: avg('clickCount'),
    keystrokeIntervalVariance: avg('keystrokeIntervalVariance'),
  };
}

/**
 * Load prior Behavior snapshots (excludes current batch) and build baseline profile.
 * @param {string} userId
 * @returns {Promise<ReturnType<typeof buildBehaviorProfile>>}
 */
async function getBehaviorBaselineProfile(userId) {
  const uid = userId?.toString?.() || userId;
  if (!uid) return null;

  const rows = await db.Behavior.find({ userId: uid })
    .sort({ createdAt: -1 })
    .limit(BASELINE_LIMIT)
    .lean();

  if (rows.length === 0) return null;

  const featuresList = rows.map((doc) =>
    extractFeatures({
      mouseMoves: doc.mouseMoves || [],
      clicks: doc.clicks || [],
      keystrokes: doc.keystrokes || [],
    })
  );

  return buildBehaviorProfile(featuresList);
}

/**
 * Score login-time behavior batch vs stored baseline (0 = no anomaly).
 * @param {object} behaviorPayload - e.g. { mouseMoves, clicks, keystrokes }
 * @param {object|null} baselineBehavior - from UserSecurity or buildBehaviorProfile
 * @returns {number}
 */
function detectAnomaly(behaviorPayload, baselineBehavior) {
  if (!baselineBehavior || !behaviorPayload) return 0;
  const current = extractFeatures({
    mouseMoves: behaviorPayload.mouseMoves || [],
    clicks: behaviorPayload.clicks || [],
    keystrokes: behaviorPayload.keystrokes || [],
  });
  return detectBehaviorAnomaly(current, baselineBehavior);
}

module.exports = {
  buildBehaviorProfile,
  getBehaviorBaselineProfile,
  detectAnomaly,
};
