'use strict';
/**
 * Fail-closed gates — block merchant money mutations when rails are stubbed/off.
 * Aligns with packages/api/src/lib/providerState.getPaymentsState().
 * https://milloapp.com
 */

const { getPaymentsState } = require('../../lib/providerState');
const { FinancialIntegrityError } = require('./errors');

/**
 * At least one card/network rail must be in live mode (not stub/disabled) for merchant flows.
 * In production, stub mode is treated as not live.
 */
function assertMerchantPaymentsLive() {
  const s = getPaymentsState();
  if (s.mode !== 'live') {
    throw new FinancialIntegrityError(
      'Payments rail is not LIVE — configure Stripe/PayPal/Wise or use ops dashboard to enable test-only flows.',
      { code: 'PAYMENTS_NOT_LIVE', statusCode: 503 }
    );
  }
}

/**
 * Named adapter must be live (Stripe checkout, Wise payout, etc.).
 * @param {string} providerName
 */
function assertProviderAdapterLive(providerName) {
  const paymentsRegistry = require('../payments');
  paymentsRegistry.assertPaymentProviderLive(providerName);
}

module.exports = {
  assertMerchantPaymentsLive,
  assertProviderAdapterLive,
};
