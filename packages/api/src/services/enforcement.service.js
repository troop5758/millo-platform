'use strict';
/**
 * Enforcement policy: map violations → actions, apply patches to a User-shaped document.
 * Persist + ModerationLog / AdminAuditLog use {@link ./enforcementEngine.js}.
 * https://milloapp.com
 */

/** @readonly */
const ENFORCEMENT_ACTIONS = Object.freeze({
  WARN: 'WARN',
  SHADOWBAN: 'SHADOWBAN',
  TEMP_BAN: 'TEMP_BAN',
  PERMA_BAN: 'PERMA_BAN',
  THROTTLE: 'THROTTLE',
});

const DEFAULT_TEMP_BAN_MS = parseInt(process.env.ENFORCEMENT_TEMP_BAN_MS, 10) || 7 * 24 * 60 * 60 * 1000;
const DEFAULT_THROTTLE_MS = parseInt(process.env.ENFORCEMENT_THROTTLE_MS, 10) || 60 * 60 * 1000;

/** Violation type → default enforcement action (extend as moderation catalog grows). */
const VIOLATION_DEFAULT_ACTION = Object.freeze({
  TOXIC_CONTENT: ENFORCEMENT_ACTIONS.WARN,
  POLICY_VIOLATION: ENFORCEMENT_ACTIONS.WARN,
  FRAUD: ENFORCEMENT_ACTIONS.PERMA_BAN,
  SPAM: ENFORCEMENT_ACTIONS.THROTTLE,
  HARASSMENT: ENFORCEMENT_ACTIONS.SHADOWBAN,
  IMPERSONATION: ENFORCEMENT_ACTIONS.TEMP_BAN,
  CSAM_OR_ILLEGAL: ENFORCEMENT_ACTIONS.PERMA_BAN,
});

/**
 * Decide enforcement action from violation (and optional user context for future escalation).
 * @param {object|null|undefined} user — User doc or lean object; may refine action later (e.g. strike ladder).
 * @param {string} violation — key from VIOLATION_DEFAULT_ACTION or unknown
 * @returns {string|null} One of ENFORCEMENT_ACTIONS or null if unknown
 */
function enforce(user, violation) {
  void user;
  const key = violation != null ? String(violation).toUpperCase() : '';
  if (!key) return null;
  return VIOLATION_DEFAULT_ACTION[key] ?? null;
}

/**
 * Mutate a User-shaped object in memory (Mongoose doc or plain). Caller saves / syncs UserStrike as needed.
 * @param {object} user
 * @param {string} action — ENFORCEMENT_ACTIONS.*
 * @param {{ reason?: string, tempBanMs?: number, throttleMs?: number }} [opts]
 */
function applyEnforcement(user, action, opts = {}) {
  if (!user || typeof user !== 'object') return;
  const reason = opts.reason != null ? String(opts.reason).slice(0, 500) : '';
  const now = new Date();

  switch (action) {
    case ENFORCEMENT_ACTIONS.WARN:
      if (!user.flags || typeof user.flags !== 'object') user.flags = {};
      user.flags.lastEnforcementWarningAt = now;
      if (reason) user.flags.lastEnforcementWarningReason = reason;
      break;

    case ENFORCEMENT_ACTIONS.SHADOWBAN:
      user.shadowBanned = true;
      break;

    case ENFORCEMENT_ACTIONS.TEMP_BAN: {
      const ms = Math.max(60_000, Math.min(365 * 24 * 60 * 60 * 1000, Number(opts.tempBanMs) || DEFAULT_TEMP_BAN_MS));
      const until = new Date(now.getTime() + ms);
      user.status = 'suspended';
      if (reason) user.suspensionReason = reason;
      if (!user.flags || typeof user.flags !== 'object') user.flags = {};
      user.flags.enforcementTempBanUntil = until;
      break;
    }

    case ENFORCEMENT_ACTIONS.PERMA_BAN:
      user.status = 'banned';
      user.shadowBanned = false;
      if (reason) user.suspensionReason = reason;
      break;

    case ENFORCEMENT_ACTIONS.THROTTLE: {
      const ms = Math.max(1000, Math.min(30 * 24 * 60 * 60 * 1000, Number(opts.throttleMs) || DEFAULT_THROTTLE_MS));
      const until = new Date(now.getTime() + ms);
      if (!user.flags || typeof user.flags !== 'object') user.flags = {};
      user.flags.enforcementThrottleUntil = until;
      break;
    }

    default:
      break;
  }
}

module.exports = {
  ENFORCEMENT_ACTIONS,
  VIOLATION_DEFAULT_ACTION,
  DEFAULT_TEMP_BAN_MS,
  DEFAULT_THROTTLE_MS,
  enforce,
  applyEnforcement,
};
