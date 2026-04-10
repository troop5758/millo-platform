/**
 * Security hardening — CSP, HSTS, rate limit, kill-switch, secrets, tamper detection.
 * https://milloapp.com
 */
const headers = require('./headers');
const rateLimit = require('./rateLimit');
const killSwitchRegistry = require('./killSwitchRegistry');
const secretsManager = require('./secretsManager');

module.exports = {
  ...headers,
  ...rateLimit,
  ...killSwitchRegistry,
  ...secretsManager,
};
