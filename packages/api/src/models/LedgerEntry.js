'use strict';
/**
 * **Core append-only ledger** — every credit/debit via `economy.credit` / `economy.debit` writes here first.
 * Authoritative schema: `packages/database/src/schemas/LedgerEntry.js`.
 * https://milloapp.com
 */
const { LedgerEntry } = require('@millo/database');

module.exports = LedgerEntry;
