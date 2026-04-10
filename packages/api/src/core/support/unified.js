'use strict';
/**
 * Support system — unified **SupportTicket** model (MongoDB: `packages/database/src/schemas/SupportTicket.js`).
 *
 * Canonical linkage + thread:
 * - **userId** (required) — complainant
 * - **orderId** (optional) — `Order`
 * - **paymentId** (optional) — `PaymentTransaction`
 * - **messages** — embedded subdocs (authoritative thread); legacy `SupportTicketMessage` collection merged on read where applicable
 *
 * Static: `SupportTicket.CORE_LINKAGE_FIELDS` === `['userId','orderId','paymentId']`.
 * https://milloapp.com
 */

const db = require('@millo/database');

const UNIFIED_MODEL = 'SupportTicket';

/** @type {readonly ['userId','orderId','paymentId']} */
const CORE_LINKAGE_FIELDS = db.SupportTicket.CORE_LINKAGE_FIELDS || Object.freeze(['userId', 'orderId', 'paymentId']);

/**
 * @returns {readonly string[]}
 */
function getCoreLinkageFields() {
  return CORE_LINKAGE_FIELDS;
}

module.exports = {
  UNIFIED_MODEL,
  CORE_LINKAGE_FIELDS,
  getCoreLinkageFields,
  /** Mongoose model (create / query). */
  SupportTicket: db.SupportTicket,
};
