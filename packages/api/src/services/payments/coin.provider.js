'use strict';
/**
 * Coin provider — in-app coin purchases (Stripe checkout records as stripe; coin = internal/promo or reference lookup).
 * createPayment: record reference for coin flow; verifyPayment: lookup PaymentReference or LedgerEntry; refundPayment: no-op or ledger reversal.
 * https://milloapp.com
 */
const PaymentProvider = require('./PaymentProvider');
const db = require('@millo/database');
const paymentReferenceService = require('../paymentReferenceService');

class CoinProvider extends PaymentProvider {
  constructor() {
    super('coin');
  }

  /**
   * Internal / reference rail — always "live" for ledger-backed lookups.
   * Card-funded coin purchases still require Stripe on those routes.
   */
  isLive() {
    return true;
  }

  async createPayment(opts = {}) {
    const { userId, amountCents, amount, currency = 'USD', referenceId, metadata = {} } = opts;
    const ref = referenceId || `coin_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await paymentReferenceService.upsertPaymentReference({
      provider: 'coin',
      referenceId: ref,
      userId: userId || null,
      status: 'completed',
      amountCents: amountCents ?? (amount != null ? Math.round(Number(amount) * 100) : 0),
      currency: (currency || 'USD').toUpperCase(),
      metadata,
    });
    return { referenceId: ref, sessionId: ref, stub: false };
  }

  async createCheckout(opts = {}) {
    return this.createPayment(opts);
  }

  async verifyPayment(paymentIdOrReference) {
    const ref = String(paymentIdOrReference).trim();
    const payment = await paymentReferenceService.findByReference(ref);
    if (payment) {
      return {
        status: payment.status,
        amount: payment.amount,
        amountCents: payment.amountCents,
        currency: payment.currency,
      };
    }
    const ledger = await db.LedgerEntry.findOne({
      $or: [{ refId: ref }, { 'meta.paymentIntentId': ref }, { 'meta.referenceId': ref }],
    }).lean();
    if (ledger) {
      return {
        status: 'completed',
        amount: (ledger.amountCents || 0) / 100,
        amountCents: ledger.amountCents || 0,
        currency: 'USD',
      };
    }
    return { status: 'unknown' };
  }

  async refundPayment(paymentId, amountCents, meta = {}) {
    return { id: `coin_ref_${Date.now()}`, status: 'not_supported' };
  }

  async refund() {
    return this.refundPayment(null);
  }

  verifyWebhook() {
    return { ok: false, error: 'COIN_NO_WEBHOOK' };
  }

  async payout() {
    throw new Error('COIN_PAYOUT_NOT_APPLICABLE');
  }
}

module.exports = new CoinProvider();
