'use strict';
/**
 * Central fraud/safety risk → enforcement tier (single policy for account-level actions).
 *
 *   enforce(user, risk) → 'BAN' | 'RESTRICT' | 'ALLOW'  (sync; staff always ALLOW)
 *   applyRiskEnforcement(userOrId, risk, opts) → async side effects (ban / account restrict)
 *
 * Defaults: risk > 80 → BAN, risk > 60 → RESTRICT (override via RISK_ENFORCEMENT_*_THRESHOLD).
 * https://milloapp.com
 */
const db = require('@millo/database');

const RISK_DECISION = Object.freeze({
  BAN: 'BAN',
  RESTRICT: 'RESTRICT',
  ALLOW: 'ALLOW',
});

const STAFF_ROLES = new Set(['admin', 'mod', 'support', 'ops']);

function riskBanThreshold() {
  const n = Number(process.env.RISK_ENFORCEMENT_BAN_THRESHOLD);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 80;
}

function riskRestrictThreshold() {
  const n = Number(process.env.RISK_ENFORCEMENT_RESTRICT_THRESHOLD);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 60;
}

function isStaffUser(user) {
  if (!user || user.role == null) return false;
  return STAFF_ROLES.has(String(user.role));
}

/**
 * Pure tier from numeric risk (and optional user for staff bypass).
 * @param {object|null|undefined} user — lean/full user with `role`, or null
 * @param {number} risk
 * @returns {'BAN'|'RESTRICT'|'ALLOW'}
 */
function evaluateRiskEnforcement(user, risk) {
  if (isStaffUser(user)) return RISK_DECISION.ALLOW;
  const r = Number(risk);
  if (!Number.isFinite(r)) return RISK_DECISION.ALLOW;
  const capped = Math.min(100, Math.max(0, r));
  if (capped > riskBanThreshold()) return RISK_DECISION.BAN;
  if (capped > riskRestrictThreshold()) return RISK_DECISION.RESTRICT;
  return RISK_DECISION.ALLOW;
}

/**
 * @param {object|string|import('mongoose').Types.ObjectId} userOrId
 * @param {number} risk
 * @returns {'BAN'|'RESTRICT'|'ALLOW'}
 */
function enforce(userOrId, risk) {
  let userDoc = null;
  if (userOrId && typeof userOrId === 'object' && 'role' in userOrId) {
    userDoc = userOrId;
  }
  return evaluateRiskEnforcement(userDoc, risk);
}

/**
 * Single mapping point for multiple numeric risk signals (device, behavior, etc.): use the worst score.
 * @param {...number} scores — 0–100 each
 * @returns {number} capped 0–100
 */
function combineRiskScores(...scores) {
  const nums = scores.map(Number).filter((n) => Number.isFinite(n) && n >= 0);
  if (nums.length === 0) return 0;
  return Math.min(100, Math.max(...nums));
}

function extractUserId(userOrId) {
  if (userOrId == null || userOrId === '') return null;
  if (typeof userOrId === 'object' && userOrId._id != null) return userOrId._id;
  if (typeof userOrId === 'object' && userOrId.id != null) return userOrId.id;
  return userOrId;
}

/**
 * Apply ban or account restriction from risk score (idempotent where possible).
 * @param {object|string|import('mongoose').Types.ObjectId} userOrId
 * @param {number} risk
 * @param {{ source?: string, reason?: string, meta?: object }} [opts]
 * @returns {Promise<{ decision: string, applied: boolean, skipped?: string, sync?: object }>}
 */
async function applyRiskEnforcement(userOrId, risk, opts = {}) {
  const userId = extractUserId(userOrId);
  const uidStr = userId?.toString?.() || (userId != null ? String(userId) : '');
  if (!uidStr) {
    return { decision: RISK_DECISION.ALLOW, applied: false, skipped: 'no_user_id' };
  }

  if (process.env.RISK_ENFORCEMENT_ENGINE === 'false') {
    const u = await db.User.findById(uidStr).select('role').lean();
    return {
      decision: evaluateRiskEnforcement(u, risk),
      applied: false,
      skipped: 'engine_disabled',
    };
  }

  const quick = evaluateRiskEnforcement(null, risk);
  if (quick === RISK_DECISION.ALLOW) {
    return { decision: RISK_DECISION.ALLOW, applied: false, userId: uidStr };
  }

  const userDoc = await db.User.findById(uidStr).select('role status').lean();
  const decision = evaluateRiskEnforcement(userDoc, risk);

  const base = {
    decision,
    applied: false,
    userId: uidStr,
  };

  if (decision === RISK_DECISION.ALLOW) return base;

  const reason = (opts.reason != null ? String(opts.reason) : '').slice(0, 500);
  const meta = { ...(opts.meta && typeof opts.meta === 'object' ? opts.meta : {}), risk: Number(risk) };

  if (decision === RISK_DECISION.BAN) {
    const enforcementEngine = require('./enforcementEngine');
    await enforcementEngine.banUser(uidStr, {
      reason: reason || `risk_enforcement_ban_score_${Math.round(Number(risk))}`,
      meta,
    });
    return { ...base, applied: true };
  }

  const fraudEnforcementSync = require('./fraudEnforcementSync');
  const sync = await fraudEnforcementSync.syncUserStatusFromFraudScore(uidStr, risk, {
    source: opts.source || 'risk_enforcement_engine',
    reason: reason || `risk_enforcement_restrict_score_${Math.round(Number(risk))}`,
    meta,
    fromCentralRiskTier: true,
  });
  return { ...base, applied: sync.applied === true, sync };
}

module.exports = {
  RISK_DECISION,
  riskBanThreshold,
  riskRestrictThreshold,
  combineRiskScores,
  evaluateRiskEnforcement,
  enforce,
  applyRiskEnforcement,
};
