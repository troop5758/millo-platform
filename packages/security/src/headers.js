/**
 * Security headers — CSP, HSTS. https://milloapp.com
 */
const CSP_DEFAULT =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' https://api.milloapp.com wss://api.milloapp.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.sentry.io; " +
  "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const HSTS_MAX_AGE = 31536000;
const HSTS_INCLUDE_SUBDOMAINS = true;
const HSTS_PRELOAD = true;

function getCSPHeader(value) {
  return value || process.env.CSP_HEADER || CSP_DEFAULT;
}

function getHSTSHeader(options = {}) {
  const maxAge = options.maxAge ?? HSTS_MAX_AGE;
  const includeSubdomains = options.includeSubdomains !== false;
  const preload = options.preload !== false;
  let h = "max-age=" + maxAge;
  if (includeSubdomains) h += "; includeSubDomains";
  if (preload) h += "; preload";
  return h;
}

module.exports = { getCSPHeader, getHSTSHeader, CSP_DEFAULT };
