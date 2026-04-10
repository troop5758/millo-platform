'use strict';
/**
 * Support ticket (support ↔ payment / order link + embedded messages).
 * Shape: userId, orderId?, paymentId?, status, messages[] (+ SLA, assignment, etc.).
 * Authoritative schema: `packages/database/src/schemas/SupportTicket.js`.
 * https://milloapp.com
 */
const { SupportTicket } = require('@millo/database');

module.exports = SupportTicket;
