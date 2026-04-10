/**
 * Wallet model — platform wallet for user balance.
 * Wraps @millo/database Wallet schema.
 * https://milloapp.com
 */
const db = require('@millo/database');

const Wallet = db.Wallet;

module.exports = { Wallet };
