'use strict';
/**
 * Queued webhook processor. Full Stripe/PayPal/Wise business logic remains in `routes/payments.js` today.
 * Enable `PAYMENTS_ORCHESTRATOR_STRIPE_CREDIT=true` only when HTTP handlers enqueue jobs and skip in-handler coin credit
 * to avoid double-ledger writes.
 * https://milloapp.com
 */
const crypto = require('crypto');
const { creditCoinPurchase } = require('./ledger');
const { scoreTransaction, assertAllowed } = require('./fraud');
const { isProcessed, markProcessed } = require('./idempotency');
const { pricing } = require('@millo/economy');

class PaymentOrchestrator {
  async process(provider, event) {
    const id = event?.id || event?.event_id || crypto.createHash('sha256').update(JSON.stringify(event || {})).digest('hex').slice(0, 64);

    if (await isProcessed(id)) return { skipped: true };

    switch (provider) {
      case 'stripe':
        await this.handleStripe(event);
        break;
      case 'paypal':
        await this.handlePayPal(event);
        break;
      case 'wise':
        await this.handleWise(event);
        break;
      default:
        throw new Error('UNKNOWN_PROVIDER');
    }

    await markProcessed(id);
    return { ok: true };
  }

  async handleStripe(event) {
    if (process.env.PAYMENTS_ORCHESTRATOR_STRIPE_CREDIT !== 'true') {
      return;
    }
    if (event.type === 'checkout.session.completed') {
      const s = event.data?.object || {};
      const userId = s.metadata?.userId;
      const packId = s.metadata?.packId;
      if (!userId || !packId) return;

      const amount = s.amount_total != null ? Number(s.amount_total) : 0;
      const fraudScore = scoreTransaction({
        amount,
        isNewDevice: false,
        isVPN: false,
        velocity: 0,
      });
      assertAllowed(fraudScore);

      const totalCoins = pricing.packTotalCoins(packId);
      if (totalCoins <= 0) return;

      const piRaw = s.payment_intent;
      const piId =
        typeof piRaw === 'string'
          ? piRaw
          : piRaw && typeof piRaw === 'object' && piRaw.id
            ? String(piRaw.id)
            : '';
      const refId = piId || String(s.id);
      await creditCoinPurchase(userId, totalCoins, refId, {
        packId,
        stripeSessionId: s.id,
        source: 'orchestrator_checkout_session_completed',
      });
    }
  }

  async handlePayPal(/* event */) {
    /* map PAYMENT.CAPTURE.COMPLETED → economy when moving PayPal off the HTTP handler */
  }

  async handleWise(/* event */) {
    /* payout state updates when moving Wise off the HTTP handler */
  }
}

module.exports = { PaymentOrchestrator };
