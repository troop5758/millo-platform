'use strict';
/**
 * Account status middleware — Phase 1 Auth & Identity Hardening.
 * Returns 403 ACCOUNT_DISABLED when user.status !== 'active'.
 * https://milloapp.com
 */
const {
  USER_ACCOUNT_STATUS,
  USER_ACCOUNT_VERIFICATION_PENDING,
  normalizeUserStatus,
} = require('@millo/shared').userAccountStatus;

function requireActiveAccount(request, reply) {
  const user = request.user;
  if (!user) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid auth token' });
  }
  const status = normalizeUserStatus(user.status);
  if (status !== USER_ACCOUNT_STATUS.ACTIVE) {
    return reply.status(403).send({
      error: 'ACCOUNT_DISABLED',
      message: status === USER_ACCOUNT_STATUS.BANNED
        ? 'Your account has been permanently suspended.'
        : status === USER_ACCOUNT_STATUS.SUSPENDED
          ? 'Your account has been suspended.'
          : status === USER_ACCOUNT_STATUS.RESTRICTED
            ? 'Your account is restricted due to risk signals. Contact support if you believe this is an error.'
            : status === USER_ACCOUNT_VERIFICATION_PENDING
              ? 'Your account is pending verification.'
              : 'Your account is not active.',
      status,
      suspensionReason: user.suspensionReason || null,
    });
  }
}

module.exports = { requireActiveAccount };
