/**
 * Payout model — payout requests with admin approval flow.
 * Wraps @millo/database PayoutRequest schema.
 * https://milloapp.com
 */
const db = require('@millo/database');

const Payout = db.PayoutRequest;

module.exports = { Payout };
