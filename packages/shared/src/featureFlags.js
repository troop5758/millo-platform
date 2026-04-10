/**
 * Feature flags — Phase 1. Env-based. No business logic.
 * https://milloapp.com
 */

function getFlag(name) {
  const key = `FEATURE_${String(name).toUpperCase().replace(/-/g, '_')}`;
  const v = process.env[key];
  if (v === undefined || v === '') return false;
  return v === '1' || v === 'true' || v === 'yes';
}

function isEnabled(name) {
  return getFlag(name) === true;
}

module.exports = { getFlag, isEnabled };
