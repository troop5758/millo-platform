/**
 * Kill-switch system — Phase 1. Env-based. No business logic.
 * https://milloapp.com
 */

function getSwitch(name) {
  const key = `KILL_SWITCH_${String(name).toUpperCase().replace(/-/g, '_')}`;
  const v = process.env[key];
  if (v === undefined || v === '') return true;
  return v !== '0' && v !== 'false' && v !== 'off';
}

function isEnabled(name) {
  return getSwitch(name) === true;
}

function isKilled(name) {
  return !isEnabled(name);
}

module.exports = { getSwitch, isEnabled, isKilled };
