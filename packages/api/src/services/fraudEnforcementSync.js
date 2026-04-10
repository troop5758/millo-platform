'use strict';
/**
 * Fraud enforcement sync — elevate User.status when fraud score exceeds policy (e.g. restrict account).
 * https://milloapp.com
 */
const db = require('@millo/database');
const { USER_ACCOUNT_STATUS } = require('@millo/shared').userAccountStatus;

/** Sync when fraudScore > this value (default 70; override FRAUD_ENFORCEMENT_RESTRICT_THRESHOLD). */
function fraudEnforcementRestrictThreshold() {
  const n = Number(process.env.FRAUD_ENFORCEMENT_RESTRICT_THRESHOLD);
  return Number.isFinite(n) && n >= 0 ? n : 70;
}

const STAFF_ROLES = new Set(['admin', 'mod', 'support']);

/**
 * If fraudScore > threshold, set user.status to restricted (does not override banned/suspended or staff).
 * @param {string} userId
 * @param {number} fraudScore
 * @param {{ source?: string, reason?: string, meta?: object }} [opts]
 * @returns {Promise<{ applied: boolean, reason?: string, status?: string }>}
 */
async function syncUserStatusFromFraudScore(userId, fraudScore, opts = {}) {
  const uid = userId?.toString?.() || userId;
  if (!uid || fraudScore == null) return { applied: false, reason: 'missing' };

  const score = Number(fraudScore);
  if (!Number.isFinite(score)) return { applied: false, reason: 'invalid_score' };

  const threshold = fraudEnforcementRestrictThreshold();
  /* Central risk tier (`riskEnforcementEngine`): skip numeric threshold gate. */
  if (!opts.fromCentralRiskTier && score <= threshold) return { applied: false, reason: 'below_threshold' };

  const user = await db.User.findById(uid);
  if (!user) return { applied: false, reason: 'not_found' };

  if (STAFF_ROLES.has(user.role)) return { applied: false, reason: 'staff_skipped' };

  if (
    user.status === USER_ACCOUNT_STATUS.BANNED
    || user.status === USER_ACCOUNT_STATUS.SUSPENDED
  ) {
    return { applied: false, reason: 'stronger_status' };
  }

  if (user.status === USER_ACCOUNT_STATUS.RESTRICTED) {
    return { applied: false, reason: 'already_restricted' };
  }

  /* PATCH 16 — fraud enforcement: fraudScore > threshold (default 70) → restricted + save. */
  user.status = USER_ACCOUNT_STATUS.RESTRICTED;
  const reasonText = (opts.reason
    || `Automated fraud enforcement: score ${Math.round(score)} (threshold ${threshold})`).slice(0, 500);
  user.suspensionReason = reasonText;
  await user.save();

  const mongoose = require('mongoose');
  const SYSTEM_MODERATOR_ID = mongoose.Types.ObjectId.isValid('000000000000000000000001')
    ? new mongoose.Types.ObjectId('000000000000000000000001')
    : null;

  await db.AdminAuditLog.create({
    action: 'fraud_enforcement_restrict',
    adminId: SYSTEM_MODERATOR_ID,
    targetType: 'User',
    targetId: uid,
    overrideReason: reasonText,
    meta: {
      fraudScore: Math.round(score),
      threshold,
      source: opts.source || 'fraud_enforcement_sync',
      ...(opts.meta && typeof opts.meta === 'object' ? opts.meta : {}),
    },
  }).catch(() => {});

  return { applied: true, status: USER_ACCOUNT_STATUS.RESTRICTED };
}

module.exports = {
  fraudEnforcementRestrictThreshold,
  syncUserStatusFromFraudScore,
};
