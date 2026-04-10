'use strict';
/**
 * Errors thrown when enforcement requires a capability the control plane does not expose as LIVE.
 * https://milloapp.com
 */

class SystemDisabledError extends Error {
  /**
   * @param {string} message
   * @param {{ capability?: string, mode?: string, code?: string }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'SystemDisabledError';
    this.code = meta.code || 'SYSTEM_CAPABILITY_DISABLED';
    this.capability = meta.capability;
    this.mode = meta.mode;
    this.statusCode = 503;
  }
}

module.exports = { SystemDisabledError };
