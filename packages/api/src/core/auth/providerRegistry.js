'use strict';
/**
 * Enterprise auth provider registry — env-driven LIVE | DISABLED for primary IdPs.
 * Uses same client-id resolution as `services/oauthProviders` (GOOGLE_CLIENT_ID / OAUTH_* / APPLE_CLIENT_ID).
 *
 * For full OAuth readiness (secrets, control-plane oauth capability), use
 * `identityControl.assertOAuthProviderLive` or `oauthProviders.requireProviderConfigured`.
 * https://milloapp.com
 */

const oauthProviders = require('../../services/oauthProviders');

/** @typedef {'LIVE'|'DISABLED'} AuthProviderMode */

/**
 * @param {'google'|'apple'} providerId
 * @returns {AuthProviderMode}
 */
function getAuthProviderMode(providerId) {
  const id = String(providerId || '').toLowerCase();
  if (id !== 'google' && id !== 'apple') return 'DISABLED';
  const clientId = oauthProviders.getOAuthClientId(id);
  return clientId ? 'LIVE' : 'DISABLED';
}

/**
 * Snapshot object (plain). Prefer for logging or spreading; `AuthProviders` proxy reads fresh env on each property access.
 * @returns {{ google: AuthProviderMode, apple: AuthProviderMode }}
 */
function getAuthProvidersSnapshot() {
  return {
    google: getAuthProviderMode('google'),
    apple: getAuthProviderMode('apple'),
  };
}

const AuthProviders = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === 'google' || prop === 'apple') {
        return getAuthProviderMode(prop);
      }
      return undefined;
    },
    ownKeys() {
      return ['google', 'apple'];
    },
    getOwnPropertyDescriptor(_t, prop) {
      if (prop === 'google' || prop === 'apple') {
        return {
          enumerable: true,
          configurable: true,
          value: getAuthProviderMode(prop),
        };
      }
    },
  }
);

/**
 * Login contract — throws if Google sign-in is not env-enabled at client-id level.
 * @throws {Error} "Google login unavailable"
 */
function assertGoogleLoginAvailable() {
  if (getAuthProviderMode('google') !== 'LIVE') {
    throw new Error('Google login unavailable');
  }
}

/**
 * @param {'google'|'apple'} providerId
 * @throws {Error} "<provider> login unavailable"
 */
function assertAuthProviderAvailable(providerId) {
  const id = String(providerId || '').toLowerCase();
  if (id !== 'google' && id !== 'apple') {
    throw new Error('Unknown auth provider');
  }
  if (getAuthProviderMode(id) !== 'LIVE') {
    const label = id === 'google' ? 'Google' : 'Apple';
    throw new Error(`${label} login unavailable`);
  }
}

module.exports = {
  AuthProviders,
  getAuthProviderMode,
  getAuthProvidersSnapshot,
  assertGoogleLoginAvailable,
  assertAuthProviderAvailable,
};
