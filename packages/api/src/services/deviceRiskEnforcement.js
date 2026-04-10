'use strict';
/**
 * Device risk enforcement — high-risk devices can auto-restrict accounts at login / before payment.
 * Risk is 0–100 where higher is worse (inverse of device "reputation" goodness).
 *
 * Env:
 * - DEVICE_RISK_ENFORCEMENT — set to `false` to skip enforcement (still export calculateDeviceRisk).
 * - DEVICE_RISK_RESTRICT_THRESHOLD — legacy export only; tiers use RISK_ENFORCEMENT_* on {@link riskEnforcementEngine}.
 * https://milloapp.com
 */

const deviceReputationService = require('./deviceReputationService');
const fraudService = require('./fraudService');
const { applyRiskEnforcement } = require('./riskEnforcementEngine');

const DISABLED = process.env.DEVICE_RISK_ENFORCEMENT === 'false';
/** @deprecated Retained for observability only; enforcement tiers come from {@link riskEnforcementEngine}. */
const THRESHOLD = Number(process.env.DEVICE_RISK_RESTRICT_THRESHOLD) || 70;

const STAFF_ROLES = new Set(['admin', 'support', 'mod', 'ops']);

/**
 * @param {string|null|undefined} deviceId - client hint or canonical fingerprint (≥8 chars)
 * @param {string|import('mongoose').Types.ObjectId|null} [_userId] - reserved for future per-user calibration
 * @returns {Promise<number>} risk 0–100 (higher = more suspicious)
 */
async function calculateDeviceRisk(deviceId, _userId) {
  if (!deviceId || String(deviceId).trim().length < 8) return 0;
  const fp = String(deviceId).trim().slice(0, 256);

  await deviceReputationService.updateReputation(fp).catch(() => {});
  const rep = await deviceReputationService.getReputationScore(fp);
  let risk = 100 - Number(rep);

  const { accountCount } = await fraudService.checkMultiAccount(fp, 9999);
  if (accountCount >= 2) {
    risk += Math.min(45, (accountCount - 1) * 12);
  }

  return Math.min(100, Math.round(risk));
}

/**
 * Device risk → same {@link applyRiskEnforcement} tier map as behavior (BAN / RESTRICT / ALLOW). Skips staff.
 *
 * @param {object} user - lean or doc with _id, role, status
 * @param {string} deviceId
 * @param {string} source - e.g. login | payment | oauth_login
 * @returns {Promise<{ restricted: boolean, risk: number, decision?: string, applied?: boolean }>}
 */
async function maybeRestrictUserForDeviceRisk(user, deviceId, source) {
  if (DISABLED || !user || user._id == null) return { restricted: false, risk: 0 };
  if (STAFF_ROLES.has(String(user.role || ''))) return { restricted: false, risk: 0 };

  const risk = await calculateDeviceRisk(deviceId, user._id);
  if (!Number.isFinite(risk) || risk <= 0) return { restricted: false, risk: 0 };

  const src = String(source || 'unknown').slice(0, 64);
  const enforcement = await applyRiskEnforcement(user, risk, {
    source: `device_risk:${src}`,
    reason: `Device risk score ${risk}`,
    meta: {
      deviceId: String(deviceId).slice(0, 256),
      source: src,
    },
  });

  const restricted =
    enforcement.decision === 'RESTRICT'
    || enforcement.decision === 'BAN';

  return {
    restricted,
    risk,
    decision: enforcement.decision,
    applied: enforcement.applied === true,
  };
}

module.exports = {
  calculateDeviceRisk,
  maybeRestrictUserForDeviceRisk,
  DEVICE_RISK_RESTRICT_THRESHOLD: THRESHOLD,
};
