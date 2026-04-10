'use strict';
/**
 * Payment abstraction layer — Phase 2. Unified interface: createPayment, verifyPayment, refundPayment, createCheckout, verifyWebhook, refund, payout.
 *
 * Financial integrity / provider adapter contract (enterprise):
 * - isLive() — real processor available (fail-closed gates use this).
 * - charge/createCheckout, refund/refundPayment, payout, verifyWebhook
 * https://milloapp.com
 */
class PaymentProvider {
  constructor(name) {
    this.name = name;
  }

  /**
   * True when this adapter can reach the real payment network (not dev stub).
   * Subclasses override; base is fail-closed (not live).
   * @returns {boolean}
   */
  isLive() {
    return false;
  }

  /**
   * Create a payment / checkout session. Alias for createCheckout for unified API.
   * @param {Object} opts - { priceId?, amountCents?, amount?, currency?, userId, email?, metadata?, successUrl?, cancelUrl? }
   * @returns {Promise<{ url?, sessionId?, clientSecret?, paymentIntentId?, referenceId?, stub? }>}
   */
  async createPayment(opts) {
    return this.createCheckout(opts);
  }

  /**
   * Create a checkout session (coins or one-time). Returns { url, sessionId } or { clientSecret, paymentIntentId }.
   * @param {Object} opts - { priceId?, amountCents?, amount?, currency?, userId, email?, metadata?, successUrl?, cancelUrl? }
   * @returns {Promise<{ url?: string, sessionId?: string, clientSecret?: string, paymentIntentId?: string, stub?: boolean }>}
   */
  async createCheckout(opts) {
    return {};
  }

  /**
   * Verify payment status with provider (fetch current status by reference/payment id).
   * @param {string} paymentIdOrReference - Provider charge/payment/session ID or reference
   * @returns {Promise<{ status: string, amount?: number, amountCents?: number, currency?: string }>}
   */
  async verifyPayment(paymentIdOrReference) {
    return { status: 'unknown' };
  }

  /**
   * Refund a payment (full or partial). Alias for refundPayment for unified API.
   * @param {string} paymentId - Provider payment/charge ID
   * @param {number} [amountCents] - Optional partial amount
   * @param {Object} [meta] - { reason?, idempotencyKey? }
   * @returns {Promise<{ id: string, status: string }>}
   */
  async refundPayment(paymentId, amountCents, meta = {}) {
    return this.refund(paymentId, amountCents, meta);
  }

  /**
   * Refund a payment (full or partial).
   * @param {string} paymentId - Provider payment/charge ID
   * @param {number} [amountCents] - Optional partial amount
   * @param {Object} [meta] - { reason?, idempotencyKey? }
   * @returns {Promise<{ id: string, status: string }>}
   */
  async refund(paymentId, amountCents, meta = {}) {
    throw new Error('REFUND_NOT_IMPLEMENTED');
  }

  /**
   * Verify webhook payload and return event object.
   * @param {string} payload - Raw body
   * @param {string} signature - Provider signature header
   * @returns {{ ok: boolean, event?: object, error?: string }}
   */
  verifyWebhook(payload, signature) {
    return { ok: false, error: 'NOT_IMPLEMENTED' };
  }

  /**
   * Execute a payout to a recipient.
   * @param {Object} opts - { recipientId, amountCents, currency, idempotencyKey, destination?, payoutEmail?, wiseProfileId? }
   * @returns {Promise<{ id: string, status: string }>}
   */
  async payout(opts) {
    throw new Error('PAYOUT_NOT_IMPLEMENTED');
  }
}

module.exports = PaymentProvider;
