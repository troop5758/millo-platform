/**
 * Compliance & Safety — GDPR tools, DSAR, cookie consent, age gating, adult content compliance.
 * https://milloapp.com
 */
const dsar = require('./dsar');
const consent = require('./consent');
const ageGating = require('./ageGating');
const retention = require('./retention');
const adultCompliance = require('./adultCompliance');

module.exports = {
  ...dsar,
  ...consent,
  ...ageGating,
  ...retention,
  ...adultCompliance,
};
