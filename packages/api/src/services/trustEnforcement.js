'use strict';
/**
 * Trust Enforcement Layer — maps control-plane trust capabilities to enforcement modes
 * (LIVE | SHADOW | OFF) for UI disclosure and a small risk → policy → action evaluator.
 * Sources: Production Truth via getControlPlaneSnapshot() (aiModeration, kyc, fraudProtection).
 * https://milloapp.com
 */

const { getControlPlaneSnapshot } = require('../core/control-plane');

/** Capabilities surfaced for trust / safety / compliance UX + pipeline. */
const TRUST_CAPABILITIES = Object.freeze(['aiModeration', 'kyc', 'fraudProtection']);

/**
 * @param {string} capabilityId
 * @param {string} [cpMode] - mode from control plane snapshot
 * @returns {'LIVE'|'SHADOW'|'OFF'}
 */
function mapModeToEnforcement(capabilityId, cpMode) {
  const m = String(cpMode || '').toUpperCase();
  if (m === 'LIVE') return 'LIVE';
  if (m === 'SHADOW') return 'SHADOW';
  if (m === 'STUBBED' || m === 'PARTIAL') return 'SHADOW';
  if (!cpMode || m === 'OFF' || m === 'DISABLED') return 'OFF';
  return 'OFF';
}

/**
 * Public snapshot for GET /api/system/trust-enforcement and GET /health.checks.trust_enforcement.
 * @returns {{
 *   version: number,
 *   ts: string,
 *   trustMode: Record<string, { enforcement: string, controlPlaneMode?: string, truthStatus?: string }>,
 *   pipeline: { stages: string[], description: string }
 * }}
 */
function getTrustEnforcementSnapshot() {
  const snap = getControlPlaneSnapshot();
  const trustMode = {};
  for (const id of TRUST_CAPABILITIES) {
    const row = snap.capabilities[id];
    const mode = row?.mode;
    trustMode[id] = {
      enforcement: mapModeToEnforcement(id, mode),
      controlPlaneMode: mode,
      truthStatus: row?.truthStatus,
    };
  }
  return {
    version: 1,
    ts: snap.ts,
    trustMode,
    pipeline: {
      stages: ['risk', 'policy', 'action'],
      description:
        'Signals are assessed for risk, mapped to policy from the active trust enforcement mode, then an action is applied (allow, step-up, flag, or block).',
    },
  };
}

/**
 * Enforcement pipeline — risk → policy → action (deterministic from capability + risk tier).
 * @param {{ capability: string, riskTier?: string }} input
 * @returns {{ capability: string, risk: string, policy: string, action: string, enforcement: string }}
 */
function evaluateTrustPipeline(input) {
  const capability = String(input?.capability || '').trim();
  const riskTier = String(input?.riskTier || 'low').toLowerCase();
  const snap = getTrustEnforcementSnapshot();
  const enforcement =
    (capability && snap.trustMode[capability]?.enforcement) || 'OFF';

  let policy = 'baseline_only';
  let action = 'allow';

  if (enforcement === 'OFF') {
    policy = 'baseline_only';
    if (riskTier === 'high') action = 'block';
    else action = 'allow';
  } else if (enforcement === 'SHADOW') {
    policy = 'observe_and_log';
    if (riskTier === 'high') action = 'flag_for_review';
    else action = 'allow';
  } else {
    policy = 'full_trust_enforcement';
    if (riskTier === 'high') action = 'block';
    else if (riskTier === 'elevated' || riskTier === 'medium') action = 'require_step_up';
    else action = 'allow';
  }

  return { capability, risk: riskTier, policy, action, enforcement };
}

module.exports = {
  TRUST_CAPABILITIES,
  mapModeToEnforcement,
  getTrustEnforcementSnapshot,
  evaluateTrustPipeline,
};
