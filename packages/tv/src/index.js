/**
 * Smart TV — Apple TV / Android TV. Read-only, device pairing required.
 * https://milloapp.com
 */
const pairing = require('./pairing');
const readOnly = require('./readOnly');

module.exports = {
  ...pairing,
  ...readOnly,
};
