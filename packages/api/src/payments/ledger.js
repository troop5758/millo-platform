'use strict';
/**
 * Wallet credits go through @millo/economy (Mongo ledger). `schemas/ledger.sql` is an optional reference
 * if a PostgreSQL mirror is introduced later — do not use raw pg here without product sign-off.
 * https://milloapp.com
 */

/**
 * @param {string} userId
 * @param {number} totalCoins whole coins (not internal economy units)
 * @param {string} refId
 * @param {Record<string, unknown>} meta
 */
async function creditCoinPurchase(userId, totalCoins, refId, meta = {}) {
  const economy = require('@millo/economy');
  await economy.credit(userId, totalCoins * 100, 'coin_purchase', refId, meta);
}

module.exports = { creditCoinPurchase };
