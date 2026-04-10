'use strict';
/**
 * OAuth Provider Configuration Service
 * Provides clear errors and metadata for OAuth providers.
 * Frontend uses this to show only configured login options.
 * Google: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET or OAUTH_GOOGLE_*; if no client id, disableProvider('google') at load.
 * https://milloapp.com
 */

// Provider metadata
const PROVIDER_CONFIG = {
  google: {
    id: 'google',
    displayName: 'Google',
    icon: 'google',
    color: '#4285F4',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid email profile',
    envVars: ['OAUTH_GOOGLE_CLIENT_ID', 'OAUTH_GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  facebook: {
    id: 'facebook',
    displayName: 'Facebook',
    icon: 'facebook',
    color: '#1877F2',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me',
    scope: 'email',
    envVars: ['OAUTH_FACEBOOK_CLIENT_ID', 'OAUTH_FACEBOOK_CLIENT_SECRET'],
  },
  apple: {
    id: 'apple',
    displayName: 'Apple',
    icon: 'apple',
    color: '#000000',
    authUrl: 'https://appleid.apple.com/auth/authorize',
    tokenUrl: 'https://appleid.apple.com/auth/token',
    scope: 'name email',
    envVars: ['OAUTH_APPLE_CLIENT_ID', 'APPLE_CLIENT_ID'], // Apple uses JWT for client secret
    requiresSecret: false,
  },
  twitter: {
    id: 'twitter',
    displayName: 'Twitter / X',
    icon: 'twitter',
    color: '#1DA1F2',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scope: 'tweet.read users.read',
    envVars: ['OAUTH_TWITTER_CLIENT_ID', 'OAUTH_TWITTER_CLIENT_SECRET'],
  },
  github: {
    id: 'github',
    displayName: 'GitHub',
    icon: 'github',
    color: '#333333',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userInfoUrl: 'https://api.github.com/user',
    scope: 'read:user user:email',
    envVars: ['OAUTH_GITHUB_CLIENT_ID', 'OAUTH_GITHUB_CLIENT_SECRET'],
  },
};

/** Runtime-disabled providers (e.g. missing Google client id). */
const _explicitlyDisabled = new Set();

/**
 * Mark an OAuth provider as disabled for this process (registry + isProviderConfigured).
 * @param {string} providerId
 */
function disableProvider(providerId) {
  const id = String(providerId || '').toLowerCase();
  if (id && PROVIDER_CONFIG[id]) _explicitlyDisabled.add(id);
}

function getGoogleClientId() {
  return String(process.env.OAUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
}

function getGoogleClientSecret() {
  return String(process.env.OAUTH_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '').trim();
}

if (!process.env.GOOGLE_CLIENT_ID && !process.env.OAUTH_GOOGLE_CLIENT_ID) {
  disableProvider('google');
}

/**
 * Resolved client id for OAuth redirect / token exchange (supports Google legacy env names).
 * @param {string} provider
 */
function getOAuthClientId(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'google') return getGoogleClientId();
  if (p === 'apple') {
    return String(process.env.OAUTH_APPLE_CLIENT_ID || process.env.APPLE_CLIENT_ID || '').trim();
  }
  return String(process.env[`OAUTH_${p.toUpperCase()}_CLIENT_ID`] || '').trim();
}

/**
 * @param {string} provider
 */
function getOAuthClientSecret(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'google') return getGoogleClientSecret();
  return String(process.env[`OAUTH_${p.toUpperCase()}_CLIENT_SECRET`] || '').trim();
}

// Cache for validation results
let _validationCache = null;
let _validationCacheTime = 0;
const VALIDATION_CACHE_TTL_MS = 60000; // 1 minute

/**
 * Get OAuth provider status map.
 * @returns {{ google: boolean, facebook: boolean, apple: boolean, ... }}
 */
function getOAuthProviders() {
  const result = {};
  for (const id of Object.keys(PROVIDER_CONFIG)) {
    result[id] = isProviderConfigured(id);
  }
  return result;
}

/**
 * Env-only contract (no control-plane gate). Prefer `identityControl.getPublicIdentityRegistry()`
 * for GET /api/auth/providers (platform oauth capability × per-provider LIVE).
 * @returns {Record<string, 'LIVE'|'DISABLED'>}
 */
function getOAuthProvidersContract() {
  const out = {};
  for (const id of Object.keys(PROVIDER_CONFIG)) {
    out[id] = isProviderConfigured(id) ? 'LIVE' : 'DISABLED';
  }
  return out;
}

/**
 * Check if a specific provider is fully configured.
 * @param {string} provider - Provider ID (google, facebook, apple, etc.)
 * @returns {boolean}
 */
function isProviderConfigured(provider) {
  const id = String(provider || '').toLowerCase();
  if (_explicitlyDisabled.has(id)) return false;

  const config = PROVIDER_CONFIG[provider];
  if (!config) return false;

  const clientId = getOAuthClientId(provider);
  if (!clientId) return false;

  // Apple uses JWT for client secret, so it's optional
  if (config.requiresSecret === false) return true;

  const clientSecret = getOAuthClientSecret(provider);
  return !!clientSecret;
}

/**
 * Get detailed provider configuration (safe for frontend).
 * @param {string} provider - Provider ID
 * @returns {object|null}
 */
function getProviderConfig(provider) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return null;

  const enabled = isProviderConfigured(provider);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  return {
    id: config.id,
    displayName: config.displayName,
    icon: config.icon,
    color: config.color,
    enabled,
    callbackUrl: `${appUrl}/auth/oauth/${provider}/callback`,
    // Don't expose internal URLs to frontend
  };
}

/**
 * Get all provider configurations for frontend.
 * @returns {Array<object>}
 */
function getAllProviderConfigs() {
  return Object.keys(PROVIDER_CONFIG)
    .map((id) => getProviderConfig(id))
    .filter((p) => p !== null);
}

/**
 * Validate a provider is configured and throw clear error if not.
 * Use this when attempting OAuth flow.
 * @param {string} provider - Provider ID
 * @throws {Error} with clear message about missing configuration
 */
function requireProviderConfigured(provider) {
  const config = PROVIDER_CONFIG[provider];

  if (!config) {
    const error = new Error(`OAUTH_PROVIDER_UNKNOWN: Provider '${provider}' is not supported.`);
    error.code = 'OAUTH_PROVIDER_UNKNOWN';
    error.provider = provider;
    error.supportedProviders = Object.keys(PROVIDER_CONFIG);
    throw error;
  }

  const clientId = getOAuthClientId(provider);
  if (!clientId) {
    const pl = String(provider).toLowerCase();
    const hint =
      pl === 'google'
        ? 'Set GOOGLE_CLIENT_ID or OAUTH_GOOGLE_CLIENT_ID.'
        : pl === 'apple'
          ? 'Set OAUTH_APPLE_CLIENT_ID or APPLE_CLIENT_ID.'
          : `Set OAUTH_${provider.toUpperCase()}_CLIENT_ID environment variable.`;
    const error = new Error(`OAUTH_NOT_CONFIGURED: ${config.displayName} OAuth is not configured. ${hint}`);
    error.code = 'OAUTH_NOT_CONFIGURED';
    error.provider = provider;
    error.missingEnvVars =
      pl === 'google'
        ? ['GOOGLE_CLIENT_ID or OAUTH_GOOGLE_CLIENT_ID']
        : pl === 'apple'
          ? ['OAUTH_APPLE_CLIENT_ID or APPLE_CLIENT_ID']
          : [`OAUTH_${provider.toUpperCase()}_CLIENT_ID`];
    throw error;
  }

  if (config.requiresSecret !== false) {
    const clientSecret = getOAuthClientSecret(provider);
    if (!clientSecret) {
      const hint =
        String(provider).toLowerCase() === 'google'
          ? 'Set GOOGLE_CLIENT_SECRET or OAUTH_GOOGLE_CLIENT_SECRET.'
          : `Set OAUTH_${provider.toUpperCase()}_CLIENT_SECRET environment variable.`;
      const error = new Error(`OAUTH_INCOMPLETE: ${config.displayName} OAuth is missing client secret. ${hint}`);
      error.code = 'OAUTH_INCOMPLETE';
      error.provider = provider;
      error.missingEnvVars =
        String(provider).toLowerCase() === 'google'
          ? ['GOOGLE_CLIENT_SECRET or OAUTH_GOOGLE_CLIENT_SECRET']
          : [`OAUTH_${provider.toUpperCase()}_CLIENT_SECRET`];
      throw error;
    }
  }

  return config;
}

/**
 * Validate all OAuth configuration at startup.
 * Logs warnings for unconfigured providers and errors for incomplete ones.
 * @param {{ strict?: boolean, log?: object }} [opts]
 * @returns {{ valid: boolean, providers: object, warnings: string[], errors: string[] }}
 */
function validateOAuthConfig(opts = {}) {
  const now = Date.now();
  if (_validationCache && now - _validationCacheTime < VALIDATION_CACHE_TTL_MS) {
    return _validationCache;
  }

  const log = opts.log || console;
  const warnings = [];
  const errors = [];
  const providers = {};

  for (const [id, config] of Object.entries(PROVIDER_CONFIG)) {
    const clientId = getOAuthClientId(id);
    const clientSecret = getOAuthClientSecret(id);
    const requiresSecret = config.requiresSecret !== false;

    if (_explicitlyDisabled.has(id) || !clientId) {
      providers[id] = { enabled: false, reason: 'not_configured' };
      // Not an error, just info — provider is disabled
      continue;
    }

    if (requiresSecret && !clientSecret) {
      providers[id] = { enabled: false, reason: 'missing_secret' };
      const msg = `[OAuth] ${config.displayName}: CLIENT_ID set but CLIENT_SECRET missing — provider disabled`;
      errors.push(msg);
      log.error?.(msg) || log.warn?.(msg);
      continue;
    }

    providers[id] = { enabled: true };
  }

  const enabledCount = Object.values(providers).filter((p) => p.enabled).length;

  if (enabledCount === 0) {
    const msg = '[OAuth] No OAuth providers configured. Only email/password and magic-link auth will be available.';
    warnings.push(msg);
    log.warn?.(msg);
  } else {
    const enabled = Object.entries(providers)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);
    log.info?.({ providers: enabled }, `[OAuth] ${enabledCount} provider(s) enabled`);
  }

  const valid = errors.length === 0;
  _validationCache = { valid, providers, warnings, errors };
  _validationCacheTime = now;

  return _validationCache;
}

/**
 * Get the internal provider config (for server-side use only).
 * @param {string} provider
 * @returns {object|null}
 */
function getInternalProviderConfig(provider) {
  return PROVIDER_CONFIG[provider] || null;
}

/**
 * Check if any OAuth provider is enabled.
 * @returns {boolean}
 */
function hasAnyOAuthProvider() {
  return Object.keys(PROVIDER_CONFIG).some((id) => isProviderConfigured(id));
}

/**
 * Get list of enabled OAuth providers.
 * @returns {string[]}
 */
function getEnabledProviders() {
  return Object.keys(PROVIDER_CONFIG).filter((id) => isProviderConfigured(id));
}

/**
 * Get list of disabled OAuth providers with reasons.
 * @returns {Array<{ id: string, reason: string }>}
 */
function getDisabledProviders() {
  const result = [];
  for (const [id, config] of Object.entries(PROVIDER_CONFIG)) {
    if (!isProviderConfigured(id)) {
      const clientId = getOAuthClientId(id);
      result.push({
        id,
        displayName: config.displayName,
        reason: _explicitlyDisabled.has(id) || !clientId ? 'not_configured' : 'missing_secret',
      });
    }
  }
  return result;
}

module.exports = {
  PROVIDER_CONFIG,
  disableProvider,
  getGoogleClientId,
  getGoogleClientSecret,
  getOAuthClientId,
  getOAuthClientSecret,
  getOAuthProviders,
  getOAuthProvidersContract,
  isProviderConfigured,
  getProviderConfig,
  getAllProviderConfigs,
  requireProviderConfigured,
  validateOAuthConfig,
  getInternalProviderConfig,
  hasAnyOAuthProvider,
  getEnabledProviders,
  getDisabledProviders,
};
