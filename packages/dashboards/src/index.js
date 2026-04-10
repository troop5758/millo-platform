/**
 * Dashboards — Admin / Mod / Support. RBAC enforced, overrides logged.
 * https://milloapp.com
 */
const roles = require('./roles');
const admin = require('./admin');
const moderator = require('./moderator');
const support = require('./support');
const featureToggleStore = require('./featureToggleStore');

module.exports = {
  ...roles,
  ...admin,
  ...moderator,
  ...support,
  hydrateFeatureTogglesFromDb: featureToggleStore.hydrateFromDb,
  getFeatureToggleEffective: featureToggleStore.getEffective,
};
