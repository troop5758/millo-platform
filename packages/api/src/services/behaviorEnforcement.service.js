'use strict';
/**
 * Behavior enforcement pipeline — bot heuristics + baseline anomaly → CAPTCHA flag, trust edge, optional restrict.
 * https://milloapp.com
 */

const path = require('path');
const { extractFeatures } = require(path.join(__dirname, '..', '..', '..', 'workers', 'behavior.worker.js'));
const { detectBot } = require('./botDetection.service');
const { getBehaviorBaselineProfile } = require('./behaviorProfile.service');
const { detectBehaviorAnomaly } = require('./behaviorAnomaly.service');
const captchaService = require('./captchaService');
const { setRequireCaptcha } = require('../lib/requireCaptchaRedis');
const { createEdge, EDGE_TYPE, NODE_KIND } = require('./trust.service');
const { applyRiskEnforcement } = require('./riskEnforcementEngine');

const CAPTCHA_TOTAL = Number(process.env.BEHAVIOR_CAPTCHA_TOTAL_THRESHOLD) || 50;
const TRUST_EDGE_TOTAL = Number(process.env.BEHAVIOR_TRUST_EDGE_THRESHOLD) || 45;
/** Minimum combined behavior score before running central risk enforcement (`applyRiskEnforcement`). */
const RESTRICT_TOTAL = Number(process.env.BEHAVIOR_RESTRICT_TOTAL_THRESHOLD) || 80;

/**
 * @typedef {ReturnType<typeof extractFeatures>} BehaviorFeatureVector
 * @param {string|null|undefined} userId
 * @param {{ mouseMoves?: unknown[], clicks?: unknown[], keystrokes?: unknown[] }} payload — sanitized arrays
 * @returns {Promise<{ total: number, botScore: number, anomalyScore: number, requireCaptcha: boolean, captchaConfig: object|null, trustEdgeWritten: boolean, restricted: boolean }>}
 */
async function evaluateBehaviorBatch(userId, payload) {
  const uid = userId ? (userId.toString?.() || String(userId)) : null;
  const data = {
    mouseMoves: Array.isArray(payload?.mouseMoves) ? payload.mouseMoves : [],
    clicks: Array.isArray(payload?.clicks) ? payload.clicks : [],
    keystrokes: Array.isArray(payload?.keystrokes) ? payload.keystrokes : [],
  };

  const features = extractFeatures(data);
  const botScore = detectBot(features);
  let baseline = null;
  if (uid) baseline = await getBehaviorBaselineProfile(uid);
  const anomalyScore = detectBehaviorAnomaly(features, baseline);
  const total = Math.min(100, botScore + anomalyScore);

  const out = {
    total,
    botScore,
    anomalyScore,
    requireCaptcha: false,
    captchaConfig: null,
    trustEdgeWritten: false,
    restricted: false,
  };

  if (!uid) return out;

  if (total >= TRUST_EDGE_TOTAL && total > 0) {
    try {
      await createEdge({
        from: { kind: NODE_KIND.USER, id: String(uid) },
        to: { kind: NODE_KIND.DEVICE, id: 'BOT_BEHAVIOR' },
        type: EDGE_TYPE.CONNECTED_TO,
        weight: Math.min(100, Math.round(total)),
        meta: { source: 'behavior_batch', botScore, anomalyScore },
      });
      out.trustEdgeWritten = true;
    } catch (_) {
      /* optional graph */
    }
  }

  if (total > CAPTCHA_TOTAL) {
    await setRequireCaptcha(uid).catch(() => {});
    out.requireCaptcha = true;
    if (captchaService.isEnabled()) {
      out.captchaConfig = {
        siteKey: captchaService.getSiteKey(),
        provider: captchaService.getProvider(),
      };
    }
  }

  if (total >= RESTRICT_TOTAL) {
    const r = await applyRiskEnforcement(uid, total, {
      source: 'behavior_enforcement',
      reason: `Behavior risk score ${Math.round(total)}`,
      meta: { botScore, anomalyScore },
    });
    out.restricted = r.applied === true;
  }

  return out;
}

module.exports = {
  evaluateBehaviorBatch,
};
