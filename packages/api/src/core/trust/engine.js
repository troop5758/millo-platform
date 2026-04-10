'use strict';
/**
 * Trust + safety — deterministic risk score from signals and enforcement ladder.
 * Composes with existing services (fraudService, riskEngine, trustScoreEngine) as a shared contract.
 * https://milloapp.com
 */

/**
 * @param {{ deviceRisk?: number, behaviorRisk?: number, geoMismatch?: boolean }} [signals]
 * @returns {number}
 */
function evaluateRisk(signals) {
  const s = signals && typeof signals === 'object' ? signals : {};
  const deviceRisk = Number(s.deviceRisk) || 0;
  const behaviorRisk = Number(s.behaviorRisk) || 0;
  const geoMismatch = Boolean(s.geoMismatch);

  let score = 0;
  if (deviceRisk > 70) score += 40;
  if (behaviorRisk > 50) score += 30;
  if (geoMismatch) score += 20;
  return score;
}

/**
 * @param {number} risk
 * @returns {'BAN'|'RESTRICT'|'CAPTCHA'|'ALLOW'}
 */
function riskEnforcement(risk) {
  const r = Number(risk) || 0;
  if (r > 80) return 'BAN';
  if (r > 60) return 'RESTRICT';
  if (r > 40) return 'CAPTCHA';
  return 'ALLOW';
}

/**
 * @param {{ deviceRisk?: number, behaviorRisk?: number, geoMismatch?: boolean }} [signals]
 * @returns {{ score: number, action: string }}
 */
function evaluateRiskWithEnforcement(signals) {
  const score = evaluateRisk(signals);
  return { score, action: riskEnforcement(score) };
}

module.exports = {
  evaluateRisk,
  riskEnforcement,
  evaluateRiskWithEnforcement,
};
