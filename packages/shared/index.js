/**
 * Millo Shared — Phase 1 core foundation. No business logic.
 * https://milloapp.com
 */

const logger = require('./src/logger');
const featureFlags = require('./src/featureFlags');
const killSwitch = require('./src/killSwitch');
const rbac = require('./src/rbac');
const envLoader = require('./src/envLoader');
const config = require('./src/config');
const userAccountStatus = require('./src/userAccountStatus');

module.exports = {
  logger,
  featureFlags,
  killSwitch,
  rbac,
  envLoader,
  config,
  userAccountStatus,
};
