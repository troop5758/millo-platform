'use strict';
/**
 * Stripe payment provider — checkout, webhook, refund. Uses @millo/billing stripe.
 * https://milloapp.com
 */
const PaymentProvider = require('./PaymentProvider');
const stripeBilling = require('@millo/billing/src/stripe');

class StripeProvider extends PaymentProvider {
  constructor() {
    super('stripe');
  }

  isLive() {
    return !!stripeBilling.getStripe();
  }

  async createCheckout(opts = {}) {
    const { priceId, amountCents, amount, currency = 'usd', userId, email, metadata = {}, successUrl, cancelUrl } = opts;
    const stripe = stripeBilling.getStripe();
    if (!stripe) {
      if (process.env.NODE_ENV === 'production') {
        const err = new Error('STRIPE_NOT_CONFIGURED');
        err.code = 'STRIPE_NOT_CONFIGURED';
        throw err;
      }
      const stubId = `cs_stub_${Date.now()}`;
      return { sessionId: stubId, url: successUrl || null, stub: true };
    }
    if (priceId) {
      const session = await stripeBilling.createCheckoutSession(priceId, {
        userId,
        email,
        successUrl,
        cancelUrl,
        metadata,
      });
      return {
        url: session.url,
        sessionId: session.sessionId,
        stub: session.status === 'stub',
      };
    }
    const amountDollars = amount != null ? Number(amount) : (amountCents != null ? amountCents / 100 : 0);
    const session = await stripeBilling.createCheckout(amountDollars, (currency || 'usd').toLowerCase(), {
      userId: userId?.toString(),
      ...metadata,
    }, { successUrl, cancelUrl });
    return {
      url: session.url,
      sessionId: session.sessionId,
      stub: session.status === 'stub',
    };
  }

  async verifyPayment(paymentIdOrReference) {
    const stripe = stripeBilling.getStripe();
    if (!stripe) return { status: 'unknown' };
    const id = String(paymentIdOrReference).trim();
    try {
      if (id.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(id);
        return {
          status: pi.status === 'succeeded' ? 'completed' : pi.status === 'canceled' ? 'failed' : 'pending',
          amount: (pi.amount_received ?? 0) / 100,
          amountCents: pi.amount_received ?? 0,
          currency: (pi.currency || 'usd').toUpperCase(),
        };
      }
      if (id.startsWith('cs_')) {
        const session = await stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent'] });
        const status = session.status === 'complete' ? 'completed' : session.status === 'expired' ? 'failed' : 'pending';
        const amount = session.amount_total ?? 0;
        return {
          status,
          amount: amount / 100,
          amountCents: amount,
          currency: (session.currency || 'usd').toUpperCase(),
        };
      }
      const charge = await stripe.charges.retrieve(id);
      return {
        status: charge.refunded ? 'refunded' : charge.status === 'succeeded' ? 'completed' : charge.status === 'failed' ? 'failed' : 'pending',
        amount: (charge.amount ?? 0) / 100,
        amountCents: charge.amount ?? 0,
        currency: (charge.currency || 'usd').toUpperCase(),
      };
    } catch {
      return { status: 'unknown' };
    }
  }

  verifyWebhook(payload, signature) {
    return stripeBilling.verifyWebhook(payload, signature);
  }

  async refund(paymentId, amountCents, meta = {}) {
    const stripe = stripeBilling.getStripe();
    if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');
    const params = amountCents ? { amount: amountCents } : {};
    const ref = await stripe.refunds.create({ charge: paymentId, ...params }, {
      idempotencyKey: meta.idempotencyKey || `ref_${paymentId}_${Date.now()}`,
    });
    return { id: ref.id, status: ref.status };
  }

  async payout(opts) {
    const payoutService = require('@millo/billing/src/payoutService');
    const result = await payoutService.executePayout(
      opts.recipientId,
      opts.amountCents,
      opts.provider || 'stripe_connect',
      { idempotencyKey: opts.idempotencyKey, currency: opts.currency, ...opts }
    );
    return { id: result.id, status: result.status || 'completed' };
  }
}

module.exports = new StripeProvider();
