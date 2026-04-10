'use strict';
/**
 * Redis-backed lock for money mutations — same primitive as ledger (ledger:* namespace).
 * Use per-user or per-wallet keys to serialize balance + payment side effects.
 * https://milloapp.com
 */

const ledgerService = require('../ledger.service');

function sanitizeSegment(seg) {
  return String(seg || '')
    .replace(/^lock:/gi, '')
    .replace(/\s+/g, '')
    .slice(0, 200);
}

/**
 * Serialize money work for a user (wallet, purchases, payouts attribution).
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {() => Promise<T>} fn
 * @param {number} [ttlMs]
 * @returns {Promise<T>}
 */
async function withMoneyUserLock(userId, fn, ttlMs) {
  const uid = sanitizeSegment(userId || 'anonymous');
  return ledgerService.withLock(`money:user:${uid}`, fn, ttlMs);
}

/**
 * Arbitrary money-scoped lock (e.g. money:payout:${batchId}).
 * @param {string} scope - short logical name (sanitized)
 * @param {() => Promise<T>} fn
 * @param {number} [ttlMs]
 */
async function withMoneyLock(scope, fn, ttlMs) {
  const s = sanitizeSegment(scope);
  return ledgerService.withLock(`money:${s}`, fn, ttlMs);
}

module.exports = { withMoneyUserLock, withMoneyLock };
