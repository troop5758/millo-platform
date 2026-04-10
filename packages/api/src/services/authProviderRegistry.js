'use strict';
/**
 * Auth Provider Registry — OAuth providers + fallback magic-link provider.
 * Frontend can use this to render login options with good UX even when OAuth env is missing.
 * https://milloapp.com
 */

const oauthProviders = require('./oauthProviders');
const identityControl = require('./identityControl');
const { getCapabilities } = require('../config/capabilities');

/**
 * Returns a list of all auth providers with full configuration.
 * Each provider: { id, type, enabled, displayName, icon, color, ... }.
 *
 * Types:
 * - 'oauth'       → Google / Facebook / Apple / Twitter / GitHub
 * - 'magic_link'  → Email-based magic link login (always enabled)
 * - 'password'    → Email/password login (always enabled)
 */
function getAuthProviders() {
  const providers = [];

  // Add all OAuth providers — enabled only when Identity Control reports LIVE
  const oauthConfigs = oauthProviders.getAllProviderConfigs();
  for (const config of oauthConfigs) {
    const contract = identityControl.getOAuthProviderRegistryStatus(config.id);
    providers.push({
      id: config.id,
      type: 'oauth',
      enabled: contract === 'LIVE',
      contract,
      displayName: config.displayName,
      icon: config.icon,
      color: config.color,
      callbackUrl: config.callbackUrl,
    });
  }

  const ml = identityControl.getMagicLinkContractStatus();

  // Always-available: email/password
  providers.push({
    id: 'password',
    type: 'password',
    enabled: true,
    contract: 'LIVE',
    displayName: 'Email & Password',
    icon: 'mail',
    color: '#6B7280',
  });

  // Magic link — needs outbound email capability unless DISABLED
  providers.push({
    id: 'magic_link',
    type: 'magic_link',
    enabled: ml !== 'DISABLED',
    contract: ml,
    displayName: 'Email Link',
    icon: 'link',
    color: '#8B5CF6',
  });

  return providers;
}

/**
 * Get only enabled OAuth providers.
 */
function getEnabledOAuthProviders() {
  return oauthProviders.getEnabledProviders();
}

/**
 * Get summary of auth configuration for admin.
 */
function getAuthConfigSummary() {
  const validation = oauthProviders.validateOAuthConfig();
  const enabled = oauthProviders.getEnabledProviders();
  const disabled = oauthProviders.getDisabledProviders();

  return {
    oauthEnabled: enabled.length > 0,
    enabledProviders: enabled,
    disabledProviders: disabled,
    passwordEnabled: true,
    magicLinkEnabled: true,
    warnings: validation.warnings,
    errors: validation.errors,
  };
}

/**
 * Get providers formatted for API response.
 * @returns {{ providers: Array, oauth: Object, summary: Object }}
 */
function getProvidersResponse() {
  const providers = getAuthProviders();
  const registry = identityControl.getPublicIdentityRegistry();

  const oauth = {};
  for (const id of Object.keys(oauthProviders.PROVIDER_CONFIG)) {
    oauth[id] = registry[id] === 'LIVE';
  }

  const caps = getCapabilities();
  const anyLiveOAuth = Object.values(oauth).some(Boolean);

  return {
    providers,
    /** Flat contract (same keys as GET /api/auth/providers) for quick checks */
    registry,
    oauth,
    fallback: {
      password: registry.password === 'LIVE',
      magic_link: registry.magic_link !== 'DISABLED',
    },
    anyOAuthEnabled: anyLiveOAuth,
    /** Production-truth trust surface — only show OAuth as “available” when LIVE. */
    trustBadges: caps.trust || null,
    oauthLive: caps.trust?.oauth === 'LIVE',
  };
}

module.exports = {
  getAuthProviders,
  getEnabledOAuthProviders,
  getAuthConfigSummary,
  getProvidersResponse,
};

