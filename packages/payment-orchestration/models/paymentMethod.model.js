/**
 * PaymentMethod model — stored payment methods (card, PayPal, Apple Pay, Google Pay).
 * Wraps @millo/database PaymentMethod schema.
 * https://milloapp.com
 */
const db = require('@millo/database');

const PaymentMethod = db.PaymentMethod;

module.exports = { PaymentMethod };
