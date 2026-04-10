'use strict';
/**
 * Wise payment provider — international payouts with full API integration.
 * Supports: payouts, webhook verification, transfer status, cancellation.
 * Note: Wise does not support checkout or refunds for transfers.
 * https://milloapp.com
 */
const PaymentProvider = require('./PaymentProvider');
const wiseService = require('./wiseService');

class WiseProvider extends PaymentProvider {
  constructor() {
    super('wise');
  }

  isLive() {
    return wiseService.isConfigured();
  }

  /**
   * Wise does not support customer checkout — it's payout-only.
   */
  async createCheckout() {
    return {
      stub: true,
      url: null,
      sessionId: null,
      error: 'WISE_NO_CHECKOUT',
      message: 'Wise is a payout-only provider, not for customer payments',
    };
  }

  /**
   * Verify payout status by transfer ID.
   * @param {string} transferId - Wise transfer ID
   */
  async verifyPayment(transferId) {
    if (!wiseService.isConfigured()) {
      return { status: 'unknown', error: 'WISE_NOT_CONFIGURED' };
    }

    try {
      const result = await wiseService.getPayoutStatus(transferId);
      return {
        status: result.status,
        amount: result.transfer?.sourceValue,
        amountCents: Math.round((result.transfer?.sourceValue || 0) * 100),
        currency: result.transfer?.sourceCurrency || 'USD',
        targetAmount: result.transfer?.targetValue,
        targetCurrency: result.transfer?.targetCurrency,
      };
    } catch (err) {
      return { status: 'unknown', error: err.message };
    }
  }

  /**
   * Verify Wise webhook signature.
   * @param {string|Buffer} payload - Raw request body
   * @param {string} signature - X-Signature-SHA256 header
   */
  verifyWebhook(payload, signature) {
    return wiseService.verifyWebhook(payload, signature);
  }

  /**
   * Handle Wise webhook event.
   * @param {Object} event - Parsed webhook event
   */
  async handleWebhook(event) {
    return wiseService.handleWebhookEvent(event);
  }

  /**
   * Cancel/refund a pending transfer (only works before funds are sent).
   * Note: Wise transfers cannot be refunded after completion.
   * @param {string} transferId - Wise transfer ID
   */
  async refund(transferId) {
    if (!wiseService.isConfigured()) {
      throw new Error('WISE_NOT_CONFIGURED');
    }

    try {
      // First check if transfer can be cancelled
      const status = await wiseService.getPayoutStatus(transferId);

      // Can only cancel if not yet completed
      if (status.status === 'completed') {
        throw new Error('WISE_TRANSFER_COMPLETED: Cannot refund completed transfers. Wise transfers are final.');
      }

      if (status.status === 'cancelled' || status.status === 'refunded') {
        return { id: transferId, status: 'already_cancelled' };
      }

      // Try to cancel
      const result = await wiseService.cancelTransfer(transferId);
      return {
        id: transferId,
        status: 'cancelled',
        transfer: result,
      };
    } catch (err) {
      if (err.message.includes('WISE_TRANSFER_COMPLETED')) {
        throw err;
      }
      throw new Error(`WISE_CANCEL_FAILED: ${err.message}`);
    }
  }

  /**
   * Execute a payout via Wise.
   * @param {Object} opts
   * @param {string} opts.recipientId - Creator/user ID
   * @param {string} opts.recipientAccountId - Wise recipient account ID
   * @param {number} opts.amountCents - Amount in cents
   * @param {string} [opts.currency='USD'] - Target currency
   * @param {string} [opts.reference] - Payment reference
   * @param {string} [opts.idempotencyKey] - Idempotency key
   */
  async payout(opts) {
    const {
      recipientId,
      recipientAccountId,
      amountCents,
      currency = 'USD',
      reference,
      idempotencyKey,
    } = opts;

    // Validate required fields
    if (!recipientAccountId) {
      throw new Error('WISE_RECIPIENT_ACCOUNT_REQUIRED: recipientAccountId is required for Wise payouts');
    }

    const result = await wiseService.executePayout({
      creatorId: recipientId,
      recipientAccountId,
      amountCents,
      targetCurrency: currency,
      reference,
      idempotencyKey: idempotencyKey || `wise_${recipientId}_${Date.now()}`,
    });

    return {
      id: result.id,
      status: result.status,
      provider: 'wise',
      transfer: result.transfer,
    };
  }

  /**
   * Create a recipient account in Wise.
   * @param {Object} opts
   * @param {string} opts.accountHolderName - Recipient name
   * @param {string} opts.currency - Target currency
   * @param {string} opts.type - Account type (iban, sort_code, aba, email, etc.)
   * @param {Object} opts.details - Bank account details
   */
  async createRecipient(opts) {
    if (!wiseService.isConfigured()) {
      throw new Error('WISE_NOT_CONFIGURED');
    }

    return wiseService.createRecipient(opts);
  }

  /**
   * Get a quote for transfer.
   * @param {Object} opts
   * @param {number} opts.amountCents - Amount in cents
   * @param {string} [opts.sourceCurrency='USD'] - Source currency
   * @param {string} opts.targetCurrency - Target currency
   */
  async getQuote(opts) {
    if (!wiseService.isConfigured()) {
      throw new Error('WISE_NOT_CONFIGURED');
    }

    return wiseService.createQuote(opts);
  }

  /**
   * Check if Wise is properly configured.
   */
  isConfigured() {
    return wiseService.isConfigured();
  }
}

module.exports = new WiseProvider();
