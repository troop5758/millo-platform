'use strict';
/**
 * Compose idempotency + distributed lock + optional fail-closed for money operations.
 * https://milloapp.com
 */

const { executeWithIdempotency } = require('@millo/billing/src/idempotency');
const { assertMerchantPaymentsLive, assertProviderAdapterLive } = require('./failClosed');
const { withMoneyUserLock } = require('./moneyLock');

/**
 * @param {object} opts
 * @param {string|import('mongoose').Types.ObjectId} opts.userId - lock scope
 * @param {string} opts.idempotencyKey - required; same key returns same outcome
 * @param {boolean} [opts.requireMerchantLive=true] - assert getPaymentsState().mode === 'live'
 * @param {string} [opts.requireProviderLive] - e.g. 'stripe' | 'wise'
 * @param {number} [opts.lockTtlMs]
 * @param {() => Promise<any>} opts.fn
 */
async function executeMoneyOperation(opts = {}) {
  const {
    userId,
    idempotencyKey,
    requireMerchantLive = true,
    requireProviderLive,
    lockTtlMs,
    fn,
  } = opts;

  if (typeof fn !== 'function') {
    throw new Error('executeMoneyOperation: fn required');
  }

  if (requireMerchantLive) {
    assertMerchantPaymentsLive();
  }
  if (requireProviderLive) {
    assertProviderAdapterLive(requireProviderLive);
  }

  return withMoneyUserLock(
    userId,
    () => executeWithIdempotency(idempotencyKey, fn),
    lockTtlMs
  );
}

module.exports = { executeMoneyOperation };
