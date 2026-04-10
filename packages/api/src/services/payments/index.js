'use strict';
/**
 * Payment abstraction — get provider by name. Phase 2. Unified createPayment, verifyPayment, refundPayment.
 * https://milloapp.com
 */
const stripe = require('./stripe.provider');
const paypal = require('./paypal.provider');
const wise = require('./wise.provider');
const coin = require('./coin.provider');
const stripeService = require('./stripeService');
const wiseService = require('./wiseService');

const providers = new Map([
  ['stripe', stripe],
  ['paypal', paypal],
  ['wise', wise],
  ['coin', coin],
]);

function getProvider(name = 'stripe') {
  const p = providers.get(String(name).toLowerCase());
  return p || stripe;
}

/** Fallback when primary provider missing: return first available or coin for lookup-only. */
function getProviderWithFallback(preferred = 'stripe') {
  const p = providers.get(String(preferred).toLowerCase());
  if (p) return p;
  return stripe || paypal || wise || coin;
}

/**
 * Check if Stripe is properly configured for production.
 */
function isStripeConfigured() {
  return stripeService.isConfigured();
}

/**
 * Check if Wise is properly configured.
 */
function isWiseConfigured() {
  return wiseService.isConfigured();
}

/**
 * Fail-closed: named provider must report isLive().
 * @param {string} name - stripe | paypal | wise | coin
 */
function assertPaymentProviderLive(name) {
  const p = getProvider(name);
  if (!p || typeof p.isLive !== 'function' || !p.isLive()) {
    const err = new Error(`PAYMENT_PROVIDER_NOT_LIVE:${String(name).toLowerCase()}`);
    err.code = 'PAYMENT_PROVIDER_NOT_LIVE';
    err.statusCode = 503;
    throw err;
  }
}

module.exports = {
  getProvider,
  getProviderWithFallback,
  stripe,
  paypal,
  wise,
  coin,
  stripeService,
  wiseService,
  isStripeConfigured,
  isWiseConfigured,
  assertPaymentProviderLive,
};
