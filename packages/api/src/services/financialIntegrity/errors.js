'use strict';
/**
 * Financial integrity — typed errors for fail-closed money paths.
 * https://milloapp.com
 */

class FinancialIntegrityError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, statusCode?: number }} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'FinancialIntegrityError';
    this.code = meta.code || 'FINANCIAL_INTEGRITY';
    this.statusCode = meta.statusCode || 503;
  }
}

module.exports = { FinancialIntegrityError };
