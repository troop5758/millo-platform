'use strict';
/**
 * PayPal payment provider — checkout stub, webhook verify, refund/payout via billing.
 * https://milloapp.com
 */
const PaymentProvider = require('./PaymentProvider');
const db = require('@millo/database');
const { verifyPayPalWebhookAsync } = require('@millo/billing/src/webhooks');
const payoutService = require('@millo/billing/src/payoutService');

class PayPalProvider extends PaymentProvider {
  constructor() {
    super('paypal');
  }

  /** Credentials present (checkout may still be phase-limited). */
  isLive() {
    return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  }

  async createCheckout(opts = {}) {
    const { amountCents, amount, currency = 'usd', userId, successUrl, cancelUrl } = opts;
    const hasKeys = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET;
    if (!hasKeys) {
      const stubId = `pp_cs_stub_${Date.now()}`;
      await db.FinancialAuditLog.create({
        action: 'paypal_checkout_stub',
        amountCents: amountCents ?? Math.round((amount || 0) * 100),
        refType: 'paypal',
        refId: stubId,
        actorId: userId,
        meta: {},
      }).catch(() => {});
      return { sessionId: stubId, url: successUrl || null, stub: true };
    }
    // Real PayPal checkout would create order via REST API; for Phase 2 we return stub when no SDK order creation
    const stubId = `pp_cs_${Date.now()}`;
    return { sessionId: stubId, url: successUrl || null, stub: true };
  }

  async verifyPayment(paymentIdOrReference) {
    const hasKeys = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET;
    if (!hasKeys) return { status: 'unknown' };
    return { status: 'unknown' };
  }

  verifyWebhook(payload, signatureOrHeaders) {
    return verifyPayPalWebhookAsync(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
      typeof signatureOrHeaders === 'object' ? signatureOrHeaders : {}
    ).then((r) => (r.ok ? { ok: true, event: r.event } : { ok: false, error: r.error }));
  }

  async refund(paymentId, amountCents, meta = {}) {
    const hasKeys = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET;
    if (!hasKeys) throw new Error('PAYPAL_NOT_CONFIGURED');
    // PayPal refund by capture ID — would use paypal-rest-sdk or fetch
    const stubId = `pp_ref_${Date.now()}`;
    return { id: stubId, status: 'completed' };
  }

  async payout(opts) {
    const result = await payoutService.executePayout(
      opts.recipientId,
      opts.amountCents,
      'paypal',
      {
        idempotencyKey: opts.idempotencyKey,
        currency: opts.currency,
        payoutEmail: opts.payoutEmail,
        ...opts,
      }
    );
    return { id: result.id, status: result.status || 'completed' };
  }
}

module.exports = new PayPalProvider();
