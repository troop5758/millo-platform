'use strict';
/**
 * Phase 3 Payment Routing Engine — regional payment methods.
 * Routes: BR→PIX, IN→UPI, EU→SEPA/iDEAL, MX→OXXO, etc. Fallback: card.
 * https://milloapp.com
 */

/** Region/country → preferred Stripe payment_method_types (order matters). */
const REGION_PAYMENT_METHODS = {
  BR:      ['pix', 'card'],
  IN:      ['card'],           // Stripe supports UPI via card; native UPI requires India setup
  NL:      ['ideal', 'card'],
  EU:      ['sepa_debit', 'ideal', 'card'],
  MX:      ['oxxo', 'card'],
  NG:      ['card'],           // M-Pesa requires separate integration
  KE:      ['card'],
  ZA:      ['card'],
  CN:      ['card'],           // Alipay/WeChat require China partnership
  DEFAULT: ['card'],
};

/** High-risk regions — card payments blocked; coin-only required. */
const HIGH_RISK_REGIONS = new Set(['NG', 'KE', 'GH', 'EG', 'ZA', 'PK', 'BD', 'VN', 'ID', 'PH']);

/** Country → region for payment routing. */
const COUNTRY_TO_PAYMENT_REGION = {
  BR: 'BR',
  IN: 'IN',
  NL: 'NL',
  MX: 'MX',
  NG: 'NG', KE: 'KE', ZA: 'ZA', EG: 'NG', GH: 'NG',
  CN: 'CN',
  AT: 'EU', BE: 'EU', BG: 'EU', HR: 'EU', CY: 'EU', CZ: 'EU', DK: 'EU', EE: 'EU',
  FI: 'EU', FR: 'EU', DE: 'EU', GR: 'EU', HU: 'EU', IE: 'EU', IT: 'EU', LV: 'EU',
  LT: 'EU', LU: 'EU', MT: 'EU', PL: 'EU', PT: 'EU', RO: 'EU', SK: 'EU',
  SI: 'EU', ES: 'EU', SE: 'EU',
};

/**
 * Check if region requires coin-only (no direct card).
 */
function isCoinOnlyRegion(countryCode) {
  const country = (countryCode || '').toUpperCase().slice(0, 2);
  return HIGH_RISK_REGIONS.has(country);
}

/**
 * Get payment methods for region/country.
 * Returns array of Stripe payment_method_types; always includes 'card' as fallback.
 * For high-risk regions, returns [] (coin-only — caller must handle).
 */
function getPaymentMethodsForRegion(regionCode, countryCode) {
  const country = (countryCode || '').toUpperCase().slice(0, 2);
  if (HIGH_RISK_REGIONS.has(country)) return [];
  const region = (regionCode || countryCode || 'US').toUpperCase();
  const paymentRegion = COUNTRY_TO_PAYMENT_REGION[country] || region;
  const methods = REGION_PAYMENT_METHODS[paymentRegion] || REGION_PAYMENT_METHODS.DEFAULT;
  const hasCard = methods.includes('card');
  return hasCard ? methods : [...methods, 'card'];
}

/**
 * Get primary payment method label for UI.
 */
function getPrimaryMethodLabel(regionCode, countryCode) {
  const methods = getPaymentMethodsForRegion(regionCode, countryCode);
  const labels = {
    pix:         'PIX',
    card:        'Card (Visa/Mastercard)',
    ideal:       'iDEAL',
    sepa_debit:  'SEPA Direct Debit',
    oxxo:        'OXXO',
  };
  return labels[methods[0]] || 'Card';
}

/**
 * Get Stripe checkout currency for region.
 * Stripe supports: usd, eur, gbp, brl, inr, mxn, etc.
 */
function getCheckoutCurrency(regionCode, countryCode) {
  const country = (countryCode || 'US').toUpperCase();
  const currencyMap = {
    BR: 'brl', IN: 'inr', MX: 'mxn', GB: 'gbp', UK: 'gbp',
    AT: 'eur', BE: 'eur', DE: 'eur', FR: 'eur', IT: 'eur', NL: 'eur', ES: 'eur',
  };
  return currencyMap[country] || 'usd';
}

module.exports = {
  getPaymentMethodsForRegion,
  getPrimaryMethodLabel,
  getCheckoutCurrency,
  isCoinOnlyRegion,
  HIGH_RISK_REGIONS,
  REGION_PAYMENT_METHODS,
};
