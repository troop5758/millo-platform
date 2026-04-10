'use strict';
/**
 * User account status — explicit abuse / access states for User.status.
 * https://milloapp.com
 */
const USER_ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  /** Fraud / risk automation — softer than suspended; blocks most API (see auth middleware). */
  RESTRICTED: 'restricted',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
});

const USER_ACCOUNT_STATUS_VALUES = Object.freeze(Object.values(USER_ACCOUNT_STATUS));

/** Identity gate; allowed on User.status for backward compatibility (distinct from abuse tiers). */
const USER_ACCOUNT_VERIFICATION_PENDING = 'pending_verification';

/** Full Mongoose enum for User.status */
const USER_STATUS_SCHEMA_ENUM = Object.freeze([
  ...USER_ACCOUNT_STATUS_VALUES,
  USER_ACCOUNT_VERIFICATION_PENDING,
]);

function normalizeUserStatus(status) {
  if (!status) return USER_ACCOUNT_STATUS.ACTIVE;
  if (USER_STATUS_SCHEMA_ENUM.includes(status)) return status;
  return USER_ACCOUNT_STATUS.ACTIVE;
}

/** True for restricted, suspended, or banned (abuse / fraud enforcement). */
function isAbuseEnforcementStatus(status) {
  const s = status || USER_ACCOUNT_STATUS.ACTIVE;
  return (
    s === USER_ACCOUNT_STATUS.RESTRICTED
    || s === USER_ACCOUNT_STATUS.SUSPENDED
    || s === USER_ACCOUNT_STATUS.BANNED
  );
}

/** True when User.status is not active (includes pending_verification). */
function isNonActiveAccountStatus(status) {
  return normalizeUserStatus(status) !== USER_ACCOUNT_STATUS.ACTIVE;
}

module.exports = {
  USER_ACCOUNT_STATUS,
  USER_ACCOUNT_STATUS_VALUES,
  USER_ACCOUNT_VERIFICATION_PENDING,
  USER_STATUS_SCHEMA_ENUM,
  normalizeUserStatus,
  isAbuseEnforcementStatus,
  isNonActiveAccountStatus,
};
