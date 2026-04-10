'use strict';
const billingStripe = require('@millo/billing/src/stripe');

function verifyWebhook(payload, signature) {
  return billingStripe.verifyWebhook(payload, signature);
}

function getStripe() {
  return billingStripe.getStripe();
}

/**
 * Generic Checkout Session (amount in cents). Prefer domain-specific routes in routes/payments.js for coin packs / subs.
 */
async function createCheckoutSession({ userId, amountCents }) {
  const stripe = getStripe();
  if (!stripe) {
    const e = new Error('STRIPE_NOT_CONFIGURED');
    e.code = 'STRIPE_NOT_CONFIGURED';
    throw e;
  }
  const base = process.env.APP_URL || 'https://milloapp.com';
  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'Millo Coins' },
          unit_amount: Math.round(Number(amountCents)),
        },
        quantity: 1,
      },
    ],
    metadata: { userId: String(userId) },
    success_url: `${base.replace(/\/$/, '')}/success`,
    cancel_url: `${base.replace(/\/$/, '')}/cancel`,
  });
}

module.exports = {
  verifyWebhook,
  getStripe,
  createCheckoutSession,
};
