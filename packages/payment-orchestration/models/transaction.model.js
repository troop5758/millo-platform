/**
 * Transaction model — payment/ledger transactions for audit trail.
 * Wraps @millo/database Transaction and LedgerEntry schemas.
 * https://milloapp.com
 */
const db = require('@millo/database');

const Transaction = db.Transaction;
const LedgerEntry = db.LedgerEntry;

module.exports = { Transaction, LedgerEntry };
