'use strict';
/**
 * Identity Control Layer — OAuth registry + contract enforcement aligned with
 * GET /api/system/control-plane (oauth capability). Clients must only expose
 * buttons for providers whose status is LIVE; server rejects all other OAuth starts.
 *
 * Password login is always LIVE. Magic link follows email capability (needs outbound mail).
 * https://milloapp.com
 */

const oauthProviders = require('./oauthProviders');
const { getControlPlaneSnapshot, isCapabilityLive } = require('../core/control-plane/capabilityRegistry');

class IdentityProviderError extends Error {
  /**
   * @param {string} message
   * @param {{ provider?: string, status?: string, code?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'IdentityProviderError';
    this.code = meta.code || 'IDENTITY_OAUTH_NOT_LIVE';
    this.provider = meta.provider;
    this.status = meta.status;
    this.statusCode = 403;
  }
}

/**
 * Effective OAuth provider status (platform gate × env configuration).
 * @param {string} providerId
 * @returns {'LIVE'|'PARTIAL'|'DISABLED'}
 */
function getOAuthProviderRegistryStatus(providerId) {
  const id = String(providerId || '').toLowerCase();
  if (!oauthProviders.PROVIDER_CONFIG[id]) return 'DISABLED';

  const snap = getControlPlaneSnapshot();
  const platformMode = snap.capabilities?.oauth?.mode || 'DISABLED';

  if (!isCapabilityLive('oauth', platformMode)) {
    return platformMode === 'PARTIAL' ? 'PARTIAL' : 'DISABLED';
  }
  return oauthProviders.isProviderConfigured(id) ? 'LIVE' : 'DISABLED';
}

function getMagicLinkContractStatus() {
  const snap = getControlPlaneSnapshot();
  const emailMode = snap.capabilities?.email?.mode || 'DISABLED';
  if (emailMode === 'LIVE') return 'LIVE';
  if (emailMode === 'PARTIAL') return 'PARTIAL';
  return 'DISABLED';
}

/**
 * Public contract for GET /auth/providers and GET /api/auth/providers — flat LIVE | PARTIAL | DISABLED.
 * @returns {Record<string, string> & { ts: string, oauthPlatformMode: string }}
 */
function getPublicIdentityRegistry() {
  const snap = getControlPlaneSnapshot();
  const oauthPlatformMode = snap.capabilities?.oauth?.mode || 'DISABLED';

  /** @type {Record<string, string>} */
  const out = {
    ts: snap.ts || new Date().toISOString(),
    oauthPlatformMode,
    password: 'LIVE',
    magic_link: getMagicLinkContractStatus(),
  };

  for (const id of Object.keys(oauthProviders.PROVIDER_CONFIG)) {
    out[id] = getOAuthProviderRegistryStatus(id);
  }

  /** Client hints — login may require step-up via existing RBA / device signals */
  out.stepUp = {
    riskBasedAuth: true,
    deviceVerification: true,
  };

  return out;
}

/**
 * Enterprise enforcement — only LIVE may begin OAuth (redirect / callback / token exchange).
 * @param {string} providerId
 * @throws {IdentityProviderError}
 */
function assertOAuthProviderLive(providerId) {
  const id = String(providerId || '').toLowerCase();
  const status = getOAuthProviderRegistryStatus(id);
  if (status !== 'LIVE') {
    throw new IdentityProviderError(
      `OAuth provider '${id}' is not LIVE for this deployment (status=${status}).`,
      { provider: id, status, code: 'IDENTITY_OAUTH_NOT_LIVE' }
    );
  }
}

module.exports = {
  IdentityProviderError,
  getOAuthProviderRegistryStatus,
  getMagicLinkContractStatus,
  getPublicIdentityRegistry,
  assertOAuthProviderLive,
};
