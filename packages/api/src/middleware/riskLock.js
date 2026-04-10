'use strict';
/**
 * Risk lock check for sensitive routes. When user.riskLock is true, block with VERIFICATION_REQUIRED.
 * Optional: enforcement rate limit (when user was flagged by unified enforcement engine).
 * https://milloapp.com
 */
async function requireNoRiskLock(request, reply) {
  const user = request.user;
  if (!user) {
    reply.status(401).send({ error: 'UNAUTHORIZED' });
    return false;
  }
  if (user.riskLock === true) {
    reply.status(403).send({
      error: 'VERIFICATION_REQUIRED',
      message: 'Additional verification is required to perform this action.',
    });
    return false;
  }
  return true;
}

/** If enforcement engine applied rate_limit to this user, return 429. Call after auth. */
async function requireNotEnforcementRateLimited(request, reply) {
  const user = request.user;
  if (!user) return true;
  try {
    const { isUserRateLimited } = require('../lib/enforcementRateLimitRedis');
    if (await isUserRateLimited(user._id)) {
      reply.status(429).send({
        error: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      });
      return false;
    }
  } catch (_) {}
  return true;
}

module.exports = { requireNoRiskLock, requireNotEnforcementRateLimited };
