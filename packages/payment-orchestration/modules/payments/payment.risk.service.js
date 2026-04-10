/**
 * Payment risk service — fraud evaluation, velocity checks.
 * Delegates to fraud service when available (api context).
 * https://milloapp.com
 */
const db = require('@millo/database');

let _fraudService = null;
function getFraudService() {
  if (_fraudService) return _fraudService;
  try {
    _fraudService = require('../../../api/src/services/fraudService');
  } catch {
    _fraudService = null;
  }
  return _fraudService;
}

async function evaluatePayment(userId, amountCents, opts = {}) {
  const fraud = getFraudService();
  if (fraud?.evaluateAndLogPayment) {
    return fraud.evaluateAndLogPayment(userId, amountCents, opts);
  }
  return { riskScore: 0, action: 'allow', signals: [] };
}

async function checkVelocity(userId, opts = {}) {
  const fraud = getFraudService();
  if (fraud?.checkPpvVelocity) {
    return fraud.checkPpvVelocity(userId);
  }
  return { allowed: true };
}

module.exports = { evaluatePayment, checkVelocity, getFraudService };
