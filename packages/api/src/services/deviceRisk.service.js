'use strict';
/**
 * Device reputation risk for login RBA (re-export of enforcement module).
 * https://milloapp.com
 */
const { calculateDeviceRisk } = require('./deviceRiskEnforcement');

module.exports = {
  calculateDeviceRisk,
};
