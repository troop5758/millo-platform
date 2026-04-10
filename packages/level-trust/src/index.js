/**
 * Millo Level & Trust Engine — server-side scoring, gating.
 * https://milloapp.com
 */
const scoring = require('./scoring');
const gate = require('./gate');
const abuseHooks = require('./abuseHooks');
const { XP_PER_LEVEL, xpRequiredForLevel, TRUST_TIERS, trustTierForScore } = require('./constants');

module.exports = {
  ...scoring,
  ...gate,
  ...abuseHooks,
  constants: { XP_PER_LEVEL, xpRequiredForLevel, TRUST_TIERS, trustTierForScore },
};
