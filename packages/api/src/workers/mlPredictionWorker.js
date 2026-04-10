'use strict';
/**
 * ML Prediction Worker — runs ML risk prediction on feature sets and flags fraud when riskProbability > threshold.
 * predictRisk(features) calls mlInferenceService.predict; if riskProbability > 0.8, flagFraud(features.userId).
 * https://milloapp.com
 */
const mlInferenceService = require('../services/mlInferenceService');

const ML_FRAUD_THRESHOLD = Number(process.env.ML_PREDICTION_FRAUD_THRESHOLD) || 0.8;

/**
 * Flag user for fraud (FraudEvent + optional enforce job). Called when ML risk exceeds threshold.
 * @param {string|object} userId - user id
 * @param {object} [meta] - optional { riskProbability, features }
 */
async function flagFraud(userId, meta = {}) {
  if (!userId) return;
  const uid = userId?.toString?.() || userId;
  try {
    const db = require('@millo/database');
    await db.FraudEvent.create({
      userId: uid,
      eventType: 'enforcement',
      action: 'flag',
      riskScore: Math.round((meta.riskProbability ?? 0) * 100),
      meta: { source: 'ml_prediction_worker', ...meta },
    });
    const { addBotDetectionJob } = require('../lib/botDetectionQueue');
    await addBotDetectionJob('enforce', { userId: uid, reason: `ML risk ${(meta.riskProbability ?? 0).toFixed(2)}` }, { delay: 0 });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[mlPredictionWorker] flagFraud error:', err?.message);
    }
  }
}

/**
 * Predict risk from features; if riskProbability > threshold (default 0.8), flag user for fraud.
 * @param {object} features - { viewVelocity?, deviceCluster?, trustScore?, engagementRatio?, userId? }
 * @returns {Promise<{ riskProbability: number, flagged: boolean }>}
 */
async function predictRisk(features) {
  const result = await mlInferenceService.predict(features);
  const riskProbability = result.riskProbability ?? 0;
  if (riskProbability > ML_FRAUD_THRESHOLD) {
    const userId = features?.userId ?? features?.user_id;
    if (userId) {
      await flagFraud(userId, { riskProbability, features });
    }
    return { riskProbability, flagged: true };
  }
  return { riskProbability, flagged: false };
}

module.exports = {
  predictRisk,
  flagFraud,
  ML_FRAUD_THRESHOLD,
};
