'use strict';
/**
 * Wallet-scoped transaction lines (paired with immutable `LedgerEntry` for full audit).
 * Authoritative schema: `packages/database/src/schemas/Transaction.js`.
 * https://milloapp.com
 */
const { Transaction } = require('@millo/database');

module.exports = Transaction;
