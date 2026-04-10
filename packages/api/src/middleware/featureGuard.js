'use strict';
/**
 * Production Truth Layer guard — Fastify preHandlers.
 * Backend enforcement: requires LIVE status from config/production-truth.js (ProductionTruth proxy).
 * https://milloapp.com
 */

const path = require('path');
const {
  ProductionTruth,
  getProductionTruth,
  FEATURE_KEYS,
} = require(path.join(__dirname, '../../../../config/production-truth.js'));

/**
 * @param {string} feature - one of FEATURE_KEYS
 * @returns {import('fastify').preHandlerHookHandler}
 */
function requireLive(feature) {
  if (!FEATURE_KEYS.includes(feature)) {
    throw new Error(`featureGuard: unknown feature "${feature}". Use one of: ${FEATURE_KEYS.join(', ')}`);
  }

  return async function featureGuardRequireLive(request, reply) {
    const status = ProductionTruth[feature]?.status;

    if (status !== 'LIVE') {
      return reply.status(503).send({
        error: `${feature} not available`,
        status,
      });
    }
  };
}

/**
 * Optional: allow LIVE or BETA (still block DISABLED).
 * @param {string} feature
 * @returns {import('fastify').preHandlerHookHandler}
 */
function requireLiveOrBeta(feature) {
  if (!FEATURE_KEYS.includes(feature)) {
    throw new Error(`featureGuard: unknown feature "${feature}". Use one of: ${FEATURE_KEYS.join(', ')}`);
  }

  return async function featureGuardRequireLiveOrBeta(request, reply) {
    const entry = ProductionTruth[feature];
    const status = entry?.status;

    if (status === 'DISABLED') {
      return reply.status(503).send({
        error: `${feature} not available`,
        feature,
        status,
        code: 'FEATURE_DISABLED',
        detail: entry?.detail,
      });
    }
  };
}

module.exports = {
  requireLive,
  requireLiveOrBeta,
  getProductionTruth,
  FEATURE_KEYS,
};
