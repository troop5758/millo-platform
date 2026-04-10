'use strict';
/**
 * User wallet (available + pending balances in **cents**).
 * Authoritative schema: `packages/database/src/schemas/Wallet.js` — use `@millo/economy` for mutations.
 * https://milloapp.com
 */
const { Wallet } = require('@millo/database');

module.exports = Wallet;
