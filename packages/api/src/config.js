/**
 * Config loader — Millo API
 * https://milloapp.com
 */
const APP_URL = process.env.PUBLIC_APP_URL || 'https://milloapp.com';

function validateEnv(required = {}) {
  const missing = Object.entries(required)
    .filter(([, value]) => value == null || String(value).trim() === '')
    .map(([key]) => key);
  if (missing.length) {
    const err = new Error(`ENV_VALIDATION_FAILED: missing required env vars: ${missing.join(', ')}`);
    err.code = 'ENV_VALIDATION_FAILED';
    err.missing = missing;
    throw err;
  }
}

function load() {
  return {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',
    appUrl: APP_URL,
  };
}

module.exports = { load, validateEnv };
