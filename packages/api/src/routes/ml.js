'use strict';
/**
 * ML inference API — risk prediction from feature vector.
 * POST /ml/predict-risk: body { viewVelocity, deviceCluster, trustScore, engagementRatio } → { riskProbability }.
 * Uses mlInferenceService.predict.
 * https://milloapp.com
 */
const mlInferenceService = require('../services/mlInferenceService');

async function mlRoutes(app) {
  app.post('/ml/predict-risk', async (request, reply) => {
    const body = request.body || {};
    const result = await mlInferenceService.predict(body);
    return reply.send({ riskProbability: result.riskProbability });
  });
}

module.exports = { mlRoutes };
