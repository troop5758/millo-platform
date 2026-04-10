'use strict';
/**
 * ML inference — predict risk from feature vector. Used by POST /ml/predict-risk and mlPredictionWorker.
 * When ML_RISK_SERVICE_URL is set, calls external service; else returns heuristic score.
 * https://milloapp.com
 */
const ML_RISK_SERVICE_URL = process.env.ML_RISK_SERVICE_URL || '';

async function predict(features) {
  const viewVelocity = Number(features?.viewVelocity) || 0;
  const deviceCluster = Number(features?.deviceCluster) || 0;
  const trustScore = Number(features?.trustScore) ?? 50;
  const engagementRatio = Number(features?.engagementRatio) ?? 0.5;

  if (ML_RISK_SERVICE_URL && typeof fetch === 'function') {
    try {
      const url = `${ML_RISK_SERVICE_URL.replace(/\/$/, '')}/predict-risk`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewVelocity, deviceCluster, trustScore, engagementRatio }),
      });
      if (!res.ok) throw new Error(`ML service ${res.status}`);
      const data = await res.json();
      const prob = typeof data?.riskProbability === 'number' ? data.riskProbability : data?.risk_probability ?? 0;
      return { riskProbability: prob };
    } catch (_) {
      // fall through to heuristic
    }
  }

  const riskProbability = heuristicRisk(viewVelocity, deviceCluster, trustScore, engagementRatio);
  return { riskProbability };
}

function heuristicRisk(viewVelocity, deviceCluster, trustScore, engagementRatio) {
  let p = 0;
  if (viewVelocity > 50) p += 0.25;
  else if (viewVelocity > 20) p += 0.1;
  if (deviceCluster >= 10) p += 0.35;
  else if (deviceCluster >= 5) p += 0.2;
  if (trustScore < 30) p += 0.25;
  else if (trustScore < 50) p += 0.1;
  if (engagementRatio < 0.2) p += 0.2;
  else if (engagementRatio < 0.4) p += 0.05;
  return Math.min(1, Math.round(p * 100) / 100);
}

module.exports = { predict, heuristicRisk };
