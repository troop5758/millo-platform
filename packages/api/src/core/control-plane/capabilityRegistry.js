'use strict';
/**
 * Production Control Plane — single capability → mode snapshot for enforcement + UI truth.
 * Derived from config/production-truth.js (LIVE / BETA / DISABLED) plus infra signals (live streaming).
 * https://milloapp.com
 */

const path = require('path');

function loadProductionTruth() {
  return require(path.join(__dirname, '../../../../..', 'config', 'production-truth.js'));
}

function loadLiveCapabilityLayer() {
  return require(path.join(__dirname, '../../services/liveCapabilityLayer'));
}

/**
 * Normalize Production Truth rows into product-facing control-plane modes.
 * @param {'LIVE'|'BETA'|'DISABLED'} status
 * @param {'payments'|'payouts'|'email'|'push'|'kyc'|'aiModeration'} kind
 * @returns {string}
 */
function mapTruthToMode(status, kind) {
  if (status === 'LIVE') return 'LIVE';
  if (kind === 'payments' || kind === 'payouts') {
    return status === 'BETA' ? 'PARTIAL' : 'DISABLED';
  }
  if (kind === 'email') {
    return status === 'BETA' ? 'PARTIAL' : 'DISABLED';
  }
  if (kind === 'push') {
    if (status === 'BETA') return 'PARTIAL';
    return 'DISABLED';
  }
  if (kind === 'kyc') {
    if (status === 'BETA') return 'STUBBED';
    return 'OFF';
  }
  if (kind === 'aiModeration') {
    if (status === 'BETA') return 'SHADOW';
    return 'OFF';
  }
  return status === 'BETA' ? 'PARTIAL' : 'DISABLED';
}

/**
 * Live streaming: env + gateway presence (not yet in Production Truth object).
 * @returns {'LIVE'|'PARTIAL'|'OFF'}
 */
function resolveLiveStreamingMode() {
  const janus = !!(process.env.JANUS_GATEWAY_URL || process.env.JANUS_URL);
  const rtmp = !!process.env.RTMP_URL;
  const hls = !!(process.env.HLS_URL || process.env.HLS_PLAYBACK_URL);
  if (!janus && !rtmp) return 'OFF';
  if (janus && hls) return 'LIVE';
  return 'PARTIAL';
}

/**
 * OAuth / fraud: pass-through modes for UI parity (enforcement usually uses specific guards).
 * @param {'LIVE'|'BETA'|'DISABLED'} status
 * @returns {'LIVE'|'PARTIAL'|'DISABLED'}
 */
function mapOAuthMode(status) {
  if (status === 'LIVE') return 'LIVE';
  if (status === 'BETA') return 'PARTIAL';
  return 'DISABLED';
}

/**
 * @returns {{
 *   version: number,
 *   ts: string,
 *   capabilities: Record<string, { mode: string, truthStatus?: string, detail?: unknown }>
 * }}
 */
function getControlPlaneSnapshot() {
  const { getProductionTruth } = loadProductionTruth();
  const t = getProductionTruth();

  const paymentsMode = mapTruthToMode(t.payments?.status, 'payments');
  const payoutsMode = mapTruthToMode(t.payouts?.status, 'payouts');
  const emailMode = mapTruthToMode(t.email?.status || 'DISABLED', 'email');
  const pushMode = mapTruthToMode(t.push?.status, 'push');
  const kycMode = mapTruthToMode(t.kyc?.status, 'kyc');
  const aiMode = mapTruthToMode(t.aiModeration?.status, 'aiModeration');
  const liveStreamingMode = resolveLiveStreamingMode();
  const { getLiveCapabilityLayer } = loadLiveCapabilityLayer();
  const liveCapabilities = getLiveCapabilityLayer();

  return {
    version: 1,
    ts: new Date().toISOString(),
    /** Honest live stack: streaming (playback/realtime) vs filters (ingest pipeline). */
    live: liveCapabilities,
    capabilities: {
      payments: { mode: paymentsMode, truthStatus: t.payments?.status, detail: t.payments?.detail },
      payouts: { mode: payoutsMode, truthStatus: t.payouts?.status, detail: t.payouts?.detail },
      email: { mode: emailMode, truthStatus: t.email?.status, detail: t.email?.detail },
      push: { mode: pushMode, truthStatus: t.push?.status, detail: t.push?.detail },
      kyc: { mode: kycMode, truthStatus: t.kyc?.status, detail: t.kyc?.detail },
      aiModeration: { mode: aiMode, truthStatus: t.aiModeration?.status, detail: t.aiModeration?.detail },
      liveStreaming: { mode: liveStreamingMode, truthStatus: null, detail: null },
      oauth: {
        mode: mapOAuthMode(t.oauth?.status),
        truthStatus: t.oauth?.status,
        detail: t.oauth?.detail,
      },
      fraudProtection: {
        mode: mapOAuthMode(t.fraudProtection?.status),
        truthStatus: t.fraudProtection?.status,
        detail: t.fraudProtection?.detail,
      },
    },
  };
}

/** Modes that satisfy "must be LIVE" enforcement for each capability */
const LIVE_EQUIVALENTS = {
  payments: new Set(['LIVE']),
  payouts: new Set(['LIVE']),
  email: new Set(['LIVE']),
  push: new Set(['LIVE']),
  kyc: new Set(['LIVE']),
  aiModeration: new Set(['LIVE']),
  liveStreaming: new Set(['LIVE']),
  oauth: new Set(['LIVE']),
  fraudProtection: new Set(['LIVE']),
};

/**
 * @param {string} capabilityId
 * @param {string} mode
 * @returns {boolean}
 */
function isCapabilityLive(capabilityId, mode) {
  const allowed = LIVE_EQUIVALENTS[capabilityId];
  if (!allowed) return false;
  return allowed.has(mode);
}

/**
 * Normalize internal snapshot modes for public control-plane contract.
 * @param {string|null|undefined} m
 * @returns {string}
 */
function normalizePublicMode(m) {
  if (m == null || m === '') return 'DISABLED';
  if (m === 'OFF') return 'DISABLED';
  return String(m);
}

/**
 * Flat capability → mode map (mandatory core contract). Fresh on each call.
 * Modes: LIVE | PARTIAL | STUBBED | DISABLED | SHADOW (aiModeration only when shadow-moderating).
 * @returns {Record<string, string>}
 */
function getControlPlaneModes() {
  const snap = getControlPlaneSnapshot();
  const out = {};
  for (const [k, v] of Object.entries(snap.capabilities)) {
    out[k] = normalizePublicMode(v?.mode);
  }
  if (snap.live && typeof snap.live === 'object') {
    out.liveFilters = snap.live.filters === 'LIVE' ? 'LIVE' : 'STUBBED';
  }
  return out;
}

module.exports = {
  getControlPlaneSnapshot,
  mapTruthToMode,
  isCapabilityLive,
  LIVE_EQUIVALENTS,
  normalizePublicMode,
  getControlPlaneModes,
};
