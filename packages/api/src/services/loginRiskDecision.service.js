'use strict';
/**
 * Login risk gate — single decision after password: ALLOW | STEP_UP | CAPTCHA | BLOCK.
 * Combines bot/history risk ({@link riskEngine}), device reputation risk, and existing riskLock.
 * CAPTCHA gates mirror captchaService (only when provider is enabled).
 * https://milloapp.com
 */

const riskEngine = require('./riskEngine');
const captchaService = require('./captchaService');

const DECISION = Object.freeze({
  ALLOW: 'ALLOW',
  STEP_UP: 'STEP_UP',
  CAPTCHA: 'CAPTCHA',
  BLOCK: 'BLOCK',
});

/** Combined score at or above → hard block (no session). */
const HARD_BLOCK_THRESHOLD = Number(process.env.LOGIN_HARD_BLOCK_COMBINED_THRESHOLD) || 96;

/** Combined / account risk — step-up OTP path (with session + requireVerification when ATO also fires). */
const STEP_UP_COMBINED_THRESHOLD = Number(process.env.LOGIN_STEP_UP_COMBINED_THRESHOLD) || 50;

/** Also step up when engine score alone is elevated (below CAPTCHA tier by default). */
const STEP_UP_ENGINE_THRESHOLD = Number(process.env.LOGIN_STEP_UP_ENGINE_THRESHOLD) || 58;

/**
 * @param {object} params
 * @param {object} params.user — lean user with _id, riskLock
 * @param {string|null} params.deviceId — client fingerprint hint
 * @param {number} [params.deviceRisk] — from {@link deviceRiskEnforcement.maybeRestrictUserForDeviceRisk} (avoid duplicate work)
 * @returns {Promise<{ decision: string, riskScore: number, deviceRisk: number, combinedScore: number, signals: string[] }>}
 */
async function evaluateLoginRisk(params = {}) {
  const user = params.user;
  const uid = user?._id;
  if (!uid) {
    return {
      decision: DECISION.ALLOW,
      riskScore: 0,
      deviceRisk: 0,
      combinedScore: 0,
      signals: [],
    };
  }

  const { score: riskScore, signals } = await riskEngine.calculateRisk(uid).catch(() => ({ score: 0, signals: [] }));

  let deviceRisk = Number(params.deviceRisk);
  if (!Number.isFinite(deviceRisk) || deviceRisk < 0) {
    deviceRisk = 0;
  }

  const combinedScore = Math.min(
    100,
    Math.round(Number(riskScore) * 0.55 + Number(deviceRisk) * 0.45)
  );

  if (combinedScore >= HARD_BLOCK_THRESHOLD) {
    return { decision: DECISION.BLOCK, riskScore, deviceRisk, combinedScore, signals };
  }

  let needCaptcha = false;
  if (captchaService.isEnabled()) {
    const flagged = await captchaService.requireCaptchaForUser(uid);
    const scoreHit =
      captchaService.requireCaptcha(riskScore) || captchaService.requireCaptcha(combinedScore);
    needCaptcha = flagged || scoreHit;
  }

  if (needCaptcha) {
    return { decision: DECISION.CAPTCHA, riskScore, deviceRisk, combinedScore, signals };
  }

  const locked = !!user.riskLock;
  if (
    locked
    || combinedScore >= STEP_UP_COMBINED_THRESHOLD
    || Number(riskScore) >= STEP_UP_ENGINE_THRESHOLD
  ) {
    return { decision: DECISION.STEP_UP, riskScore, deviceRisk, combinedScore, signals };
  }

  return { decision: DECISION.ALLOW, riskScore, deviceRisk, combinedScore, signals };
}

module.exports = {
  DECISION,
  evaluateLoginRisk,
  HARD_BLOCK_THRESHOLD,
  STEP_UP_COMBINED_THRESHOLD,
};
