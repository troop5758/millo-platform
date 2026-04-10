'use strict';
/**
 * Security — enterprise hardening contract. https://milloapp.com
 */

const {
  HARDENING_PILLARS,
  getSecurityHardeningContract,
  getSecurityHardeningRuntimeHints,
} = require('./hardening');

module.exports = {
  HARDENING_PILLARS,
  getSecurityHardeningContract,
  getSecurityHardeningRuntimeHints,
};
