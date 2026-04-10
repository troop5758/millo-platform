'use strict';
/**
 * Login-time additive risk (device / IP / geo / behavior / failed attempts).
 * API package is CommonJS; exported via {@link module.exports} (same functions as ESM `export`).
 * https://milloapp.com
 */

function scoreLoginRisk({
  isNewDevice,
  isNewIp,
  geoMismatch,
  behaviorAnomaly,
  failedAttempts = 0,
} = {}) {
  let score = 0;

  if (isNewDevice) score += 30;
  if (isNewIp) score += 20;
  if (geoMismatch) score += 30;
  if (behaviorAnomaly) score += 30;
  if (failedAttempts > 3) score += 20;

  return score;
}

function decide(score) {
  if (score >= 80) return 'BLOCK';
  if (score >= 60) return 'STEP_UP';
  if (score >= 40) return 'CAPTCHA';
  return 'ALLOW';
}

module.exports = {
  scoreLoginRisk,
  decide,
};
