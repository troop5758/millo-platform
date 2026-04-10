'use strict';
/**
 * Aggregated provider/setup status from environment only (no external I/O).
 * Complements packages/api/src/lib/providerState.js (health snapshot).
 * https://milloapp.com
 *
 * Register optional hook: packages/api/src/middleware/providerStatus.middleware.js
 */

const { getProviderStateSnapshot } = require('../lib/providerState');

/**
 * @returns {'live'|'stub'|'disabled'}
 */
function getEmailStatus() {
  const p = (process.env.EMAIL_PROVIDER || 'console').toLowerCase().replace(/-/g, '_');
  if (!p || p === 'console') return 'stub';
  return 'live';
}

/**
 * @returns {{ mode: 'live'|'disabled', fcm: boolean, expo: boolean }}
 */
function getPushStatus() {
  const fcm = !!process.env.FIREBASE_SERVER_KEY;
  const expo = !!process.env.EXPO_ACCESS_TOKEN;
  if (fcm || expo) return { mode: 'live', fcm, expo };
  return { mode: 'disabled', fcm: false, expo: false };
}

/**
 * @returns {'live'|'disabled'|'unconfigured'}
 */
function getCloudflareReputationStatus() {
  if (process.env.CLOUDFLARE_IP_REPUTATION_ENABLED !== 'true') return 'disabled';
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (token && account) return 'live';
  return 'unconfigured';
}

/**
 * Single object for diagnostics / optional middleware.
 * @returns {object}
 */
function getProviderStatus() {
  const snap = getProviderStateSnapshot();
  return {
    payments: snap.payments,
    oauth: snap.oauth,
    aiModeration: snap.aiModeration,
    kyc: snap.kyc,
    email: getEmailStatus(),
    push: getPushStatus(),
    cloudflareReputation: getCloudflareReputationStatus(),
    ts: snap.ts,
  };
}

module.exports = {
  getProviderStatus,
  getEmailStatus,
  getPushStatus,
  getCloudflareReputationStatus,
};
