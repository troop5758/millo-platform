'use strict';
/**
 * Branding — logo URL, app name, app URL, accent color, support email.
 * Priority: DB cache (set via admin dashboard) → env vars → hardcoded defaults.
 * Admin can update via POST /dashboards/admin/branding; updates are hot-applied
 * to the in-memory cache so emails reflect changes without restart.
 * https://milloapp.com
 */

const DEFAULTS = {
  logoUrl:      'https://milloapp.com/logo.png',
  appName:      'Millo',
  appUrl:       'https://milloapp.com',
  accentColor:  '#2563eb',
  supportEmail: 'support@milloapp.com',
};

/** In-memory cache, populated by the API route after DB reads/writes. */
const _cache = {
  logoUrl:      process.env.MILLO_LOGO_URL      || DEFAULTS.logoUrl,
  appName:      process.env.MILLO_APP_NAME      || DEFAULTS.appName,
  appUrl:       process.env.MILLO_APP_URL       || DEFAULTS.appUrl,
  accentColor:  process.env.MILLO_ACCENT_COLOR  || DEFAULTS.accentColor,
  supportEmail: process.env.MILLO_SUPPORT_EMAIL || DEFAULTS.supportEmail,
};

/** Called by the branding API route to hot-apply saved settings. */
function applySettings(settings = {}) {
  if (settings.logoUrl      != null) _cache.logoUrl      = settings.logoUrl;
  if (settings.appName      != null) _cache.appName      = settings.appName;
  if (settings.appUrl       != null) _cache.appUrl       = settings.appUrl;
  if (settings.accentColor  != null) _cache.accentColor  = settings.accentColor;
  if (settings.supportEmail != null) _cache.supportEmail = settings.supportEmail;
}

function getAll()         { return { ..._cache }; }
function getLogoUrl()     { return _cache.logoUrl; }
function getAppUrl()      { return _cache.appUrl; }
function getAppName()     { return _cache.appName; }
function getAccentColor() { return _cache.accentColor; }
function getSupportEmail(){ return _cache.supportEmail; }

module.exports = {
  applySettings,
  getAll,
  getLogoUrl,
  getAppUrl,
  getAppName,
  getAccentColor,
  getSupportEmail,
  DEFAULTS,
  // Legacy named exports kept for backwards-compat:
  LOGO_URL: DEFAULTS.logoUrl,
  APP_URL:  DEFAULTS.appUrl,
  APP_NAME: DEFAULTS.appName,
};
