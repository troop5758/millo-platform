'use strict';
/**
 * Phase 3 Checkout Breakdown — product price, VAT, platform fee, total.
 * Returns localized amounts for checkout UI.
 * https://milloapp.com
 */
const { pricing } = require('@millo/economy');
const db = require('@millo/database');

/**
 * Compute checkout breakdown for order items.
 * @param {Array} orderItems - [{ productId, priceCents, qty }]
 * @param {Object} region - { user_country, user_currency, vat_rate, tax_inclusive }
 * @returns {Object} { subtotalCents, taxCents, platformFeeCents, totalCents, currency, breakdown }
 */
async function computeCheckoutBreakdown(orderItems, region) {
  const country = (region?.user_country || 'US').toUpperCase();
  const currency = (region?.user_currency || 'USD').toLowerCase();
  const vatRate = region?.vat_rate ?? 0;
  const taxInclusive = region?.tax_inclusive ?? false;

  let subtotalCents = 0;
  for (const item of orderItems) {
    subtotalCents += (item.priceCents || 0) * (item.qty || 1);
  }

  let taxCents = 0;
  if (vatRate > 0) {
    if (taxInclusive) {
      taxCents = Math.round(subtotalCents - subtotalCents / (1 + vatRate / 100));
    } else {
      taxCents = Math.round(subtotalCents * (vatRate / 100));
    }
  }

  const cfg = pricing?.getConfig?.() ?? {};
  const platformFeePct = cfg.platformFeePct ?? 20;
  const platformFeeCents = Math.round(subtotalCents * (platformFeePct / 100));

  const totalCents = taxInclusive ? subtotalCents : subtotalCents + taxCents;

  return {
    subtotalCents,
    taxCents,
    platformFeeCents,
    totalCents,
    currency,
    vatRate,
    taxInclusive,
    breakdown: [
      { label: 'checkout.productPrice', amountCents: subtotalCents },
      ...(taxCents > 0 ? [{ label: 'checkout.vat', amountCents: taxCents, rate: vatRate }] : []),
      { label: 'checkout.total', amountCents: totalCents },
    ],
  };
}

/**
 * Format amount for display (uses currency from region).
 */
function formatAmount(cents, currency) {
  const curr = (currency || 'usd').toLowerCase();
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${curr.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

module.exports = { computeCheckoutBreakdown, formatAmount };
