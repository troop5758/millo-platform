'use strict';
/**
 * Wise API Service — transfers, webhooks, recipient management.
 * Uses Wise API v3 for international payouts.
 * https://milloapp.com
 */

const crypto = require('crypto');
const db = require('@millo/database');
const economy = require('@millo/economy');

const WISE_API_URL = process.env.WISE_API_URL || 'https://api.transferwise.com';
const WISE_SANDBOX_URL = 'https://api.sandbox.transferwise.tech';

let _warned = false;

/**
 * Check if Wise is configured.
 */
function isConfigured() {
  return !!process.env.WISE_API_TOKEN;
}

/**
 * Check if we're in production mode.
 */
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if using sandbox mode.
 */
function isSandbox() {
  return process.env.WISE_SANDBOX === 'true';
}

/**
 * Get the Wise API base URL.
 */
function getBaseUrl() {
  return isSandbox() ? WISE_SANDBOX_URL : WISE_API_URL;
}

/**
 * Get Wise API token.
 * @throws {Error} in production if not configured
 */
function getToken() {
  const token = process.env.WISE_API_TOKEN;
  if (!token) {
    if (isProduction()) {
      throw new Error('WISE_NOT_CONFIGURED: WISE_API_TOKEN is required in production');
    }
    if (!_warned) {
      _warned = true;
      console.warn('[Wise] DEV MODE: WISE_API_TOKEN not configured. Payouts will use stubs.');
    }
    return null;
  }
  return token;
}

/**
 * Make authenticated request to Wise API.
 */
async function wiseRequest(method, endpoint, body = null) {
  const token = getToken();
  if (!token) {
    throw new Error('WISE_NOT_CONFIGURED');
  }

  const url = `${getBaseUrl()}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.message || `Wise API error: ${res.status}`);
    error.status = res.status;
    error.wiseError = data;
    throw error;
  }

  return data;
}

/**
 * Get Wise profile ID (business or personal).
 * @returns {Promise<string>}
 */
async function getProfileId() {
  const profileId = process.env.WISE_PROFILE_ID;
  if (profileId) return profileId;

  // Fetch profiles and use the first business profile, or first personal
  const profiles = await wiseRequest('GET', '/v1/profiles');
  const business = profiles.find(p => p.type === 'business');
  const personal = profiles.find(p => p.type === 'personal');
  return (business || personal)?.id;
}

/**
 * Create a recipient account for payout.
 * @param {Object} opts
 * @param {string} opts.currency - Target currency (e.g., 'USD', 'EUR', 'GBP')
 * @param {string} opts.type - Account type ('email', 'iban', 'sort_code', 'aba', etc.)
 * @param {Object} opts.details - Bank account details
 * @param {Object} opts.accountHolderName - Recipient name
 * @returns {Promise<Object>} Recipient account
 */
async function createRecipient(opts) {
  const { currency, type, details, accountHolderName } = opts;
  const profileId = await getProfileId();

  const recipient = await wiseRequest('POST', '/v1/accounts', {
    profile: profileId,
    accountHolderName,
    currency: currency.toUpperCase(),
    type,
    details,
  });

  return recipient;
}

/**
 * Get a quote for transfer.
 * @param {Object} opts
 * @param {number} opts.amountCents - Amount in cents (source currency)
 * @param {string} opts.sourceCurrency - Source currency (default: USD)
 * @param {string} opts.targetCurrency - Target currency
 * @returns {Promise<Object>} Quote
 */
async function createQuote(opts) {
  const { amountCents, sourceCurrency = 'USD', targetCurrency } = opts;
  const profileId = await getProfileId();
  const amount = amountCents / 100;

  const quote = await wiseRequest('POST', '/v3/profiles/' + profileId + '/quotes', {
    sourceCurrency: sourceCurrency.toUpperCase(),
    targetCurrency: targetCurrency.toUpperCase(),
    sourceAmount: amount,
    payOut: 'BANK_TRANSFER',
  });

  return quote;
}

/**
 * Create a transfer (payout).
 * @param {Object} opts
 * @param {string} opts.recipientAccountId - Wise recipient account ID
 * @param {string} opts.quoteId - Quote ID from createQuote
 * @param {string} opts.reference - Payment reference (appears on statement)
 * @param {string} [opts.idempotencyKey] - Idempotency key
 * @returns {Promise<Object>} Transfer
 */
async function createTransfer(opts) {
  const { recipientAccountId, quoteId, reference, idempotencyKey } = opts;

  const headers = {};
  if (idempotencyKey) {
    headers['X-idempotency-uuid'] = idempotencyKey;
  }

  const transfer = await wiseRequest('POST', '/v1/transfers', {
    targetAccount: recipientAccountId,
    quoteUuid: quoteId,
    customerTransactionId: idempotencyKey || `millo_${Date.now()}`,
    details: {
      reference: reference || 'Millo Payout',
      transferPurpose: 'verification.transfers.purpose.pay.bills',
      sourceOfFunds: 'verification.source.of.funds.other',
    },
  });

  return transfer;
}

/**
 * Fund a transfer (required to actually send the money).
 * @param {string} transferId - Transfer ID
 * @returns {Promise<Object>} Funding result
 */
async function fundTransfer(transferId) {
  const profileId = await getProfileId();

  const funding = await wiseRequest('POST', `/v3/profiles/${profileId}/transfers/${transferId}/payments`, {
    type: 'BALANCE',
  });

  return funding;
}

/**
 * Get transfer status.
 * @param {string} transferId - Transfer ID
 * @returns {Promise<Object>} Transfer with status
 */
async function getTransfer(transferId) {
  return wiseRequest('GET', `/v1/transfers/${transferId}`);
}

/**
 * Cancel a transfer (only possible if not yet funded).
 * @param {string} transferId - Transfer ID
 * @returns {Promise<Object>} Cancelled transfer
 */
async function cancelTransfer(transferId) {
  return wiseRequest('PUT', `/v1/transfers/${transferId}/cancel`);
}

/**
 * Complete payout flow: quote → transfer → fund.
 * @param {Object} opts
 * @param {string} opts.creatorId - Creator ID
 * @param {string} opts.recipientAccountId - Wise recipient account ID
 * @param {number} opts.amountCents - Amount in cents
 * @param {string} opts.targetCurrency - Target currency
 * @param {string} [opts.reference] - Payment reference
 * @param {string} [opts.idempotencyKey] - Idempotency key
 * @returns {Promise<{id: string, status: string, transfer: Object}>}
 */
async function executePayout(opts) {
  const {
    creatorId,
    recipientAccountId,
    amountCents,
    targetCurrency,
    reference,
    idempotencyKey,
  } = opts;

  const token = getToken();
  if (!token) {
    // Dev stub
    const stubId = `wise_stub_${Date.now()}_${creatorId}`;
    await db.FinancialAuditLog.create({
      action: 'wise_payout_stub',
      amountCents,
      refType: 'wise',
      refId: stubId,
      actorId: creatorId,
      meta: { recipientAccountId, targetCurrency, devStub: true },
    }).catch(() => {});
    console.warn(`[Wise DEV] Payout stub ${stubId} for ${amountCents} cents`);
    return { id: stubId, status: 'stub', provider: 'wise' };
  }

  // Step 1: Create quote
  const quote = await createQuote({
    amountCents,
    sourceCurrency: 'USD',
    targetCurrency: targetCurrency || 'USD',
  });

  // Step 2: Create transfer
  const transfer = await createTransfer({
    recipientAccountId,
    quoteId: quote.id,
    reference: reference || `Millo Payout #${creatorId}`,
    idempotencyKey,
  });

  // Step 3: Fund transfer
  await fundTransfer(transfer.id);

  // Log to audit
  await db.FinancialAuditLog.create({
    action: 'wise_payout',
    amountCents,
    refType: 'wise',
    refId: transfer.id,
    actorId: creatorId,
    meta: {
      quoteId: quote.id,
      recipientAccountId,
      targetCurrency,
      targetAmount: quote.targetAmount,
      fee: quote.fee,
      rate: quote.rate,
    },
  }).catch(() => {});

  // Update payout request if exists
  const wisePayout = await db.PayoutRequest.findOneAndUpdate(
    { userId: creatorId, status: 'processing' },
    {
      $set: {
        status: 'completed',
        externalId: transfer.id,
        provider: 'wise',
        completedAt: new Date(),
        'meta.wiseTransferId': transfer.id,
        'meta.wiseQuoteId': quote.id,
      },
    },
    { new: true }
  ).catch(() => null);
  if (wisePayout && economy.patchPayoutExternalId) {
    economy.patchPayoutExternalId(wisePayout).catch(() => {});
  }

  return {
    id: transfer.id,
    status: mapWiseStatus(transfer.status),
    transfer,
    provider: 'wise',
  };
}

/**
 * Map Wise transfer status to our status.
 */
function mapWiseStatus(wiseStatus) {
  const statusMap = {
    'incoming_payment_waiting': 'pending',
    'incoming_payment_initiated': 'pending',
    'processing': 'processing',
    'funds_converted': 'processing',
    'outgoing_payment_sent': 'completed',
    'cancelled': 'cancelled',
    'funds_refunded': 'refunded',
    'bounced_back': 'failed',
    'charged_back': 'refunded',
  };
  return statusMap[wiseStatus] || 'unknown';
}

/**
 * Verify Wise webhook signature.
 * Wise uses SHA256 HMAC signature.
 * @param {string|Buffer} payload - Raw request body
 * @param {string} signature - X-Signature-SHA256 header
 * @returns {{ ok: boolean, event?: Object, error?: string }}
 */
function verifyWebhook(payload, signature) {
  const secret = process.env.WISE_WEBHOOK_SECRET;

  if (!secret) {
    if (isProduction()) {
      return { ok: false, error: 'WISE_WEBHOOK_SECRET not configured in production' };
    }
    // Dev mode: parse without verification
    console.warn('[Wise DEV] Webhook signature verification SKIPPED');
    try {
      const event = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());
      return { ok: true, event, unverified: true };
    } catch {
      return { ok: false, error: 'Invalid JSON payload' };
    }
  }

  try {
    const payloadStr = typeof payload === 'string' ? payload : payload.toString();
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(String(signature || '').replace(/^sha256=/i, ''), 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) {
      return { ok: false, error: 'Invalid webhook signature' };
    }
    const valid = crypto.timingSafeEqual(sigBuf, expBuf);

    if (!valid) {
      return { ok: false, error: 'Invalid webhook signature' };
    }

    const event = JSON.parse(payloadStr);
    return { ok: true, event };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Handle Wise webhook event.
 * @param {Object} event - Webhook event
 * @returns {Promise<{handled: boolean, action?: string}>}
 */
async function handleWebhookEvent(event) {
  const eventType = event.event_type || event.eventType;
  const data = event.data || event;

  switch (eventType) {
    case 'transfers#state-change': {
      const transferId = data.resource?.id || data.transferId;
      const newState = data.current_state || data.currentState;
      const previousState = data.previous_state || data.previousState;

      if (!transferId) {
        return { handled: false, error: 'Missing transferId' };
      }

      // Update payout request status
      const status = mapWiseStatus(newState);
      const update = {
        'meta.wiseStatus': newState,
        'meta.wisePreviousStatus': previousState,
        'meta.wiseUpdatedAt': new Date(),
      };

      if (status === 'completed') {
        update.status = 'completed';
        update.completedAt = new Date();
      } else if (status === 'failed' || status === 'cancelled') {
        update.status = 'failed';
        update['meta.failureReason'] = newState;
      } else if (status === 'refunded') {
        update.status = 'refunded';
        update.refundedAt = new Date();
      }

      const whPayout = await db.PayoutRequest.findOneAndUpdate(
        { externalId: transferId },
        { $set: update },
        { new: true }
      ).lean();
      if (whPayout && economy.upsertFromPayoutRequest) {
        economy.upsertFromPayoutRequest(whPayout).catch(() => {});
      }

      // Log event
      await db.FinancialAuditLog.create({
        action: 'wise_webhook_transfer_state',
        amountCents: 0,
        refType: 'wise',
        refId: transferId,
        meta: { newState, previousState, eventType },
      }).catch(() => {});

      return { handled: true, action: 'transfer_state_updated', status };
    }

    case 'balances#credit': {
      // Funds added to Wise balance
      const amount = data.amount;
      const currency = data.currency;
      await db.FinancialAuditLog.create({
        action: 'wise_balance_credit',
        amountCents: Math.round((amount || 0) * 100),
        refType: 'wise_balance',
        refId: `balance_${Date.now()}`,
        meta: { currency, amount, eventType },
      }).catch(() => {});
      return { handled: true, action: 'balance_credited' };
    }

    case 'balances#debit': {
      // Funds debited from Wise balance (payout sent)
      const amount = data.amount;
      const currency = data.currency;
      await db.FinancialAuditLog.create({
        action: 'wise_balance_debit',
        amountCents: Math.round((amount || 0) * 100),
        refType: 'wise_balance',
        refId: `balance_${Date.now()}`,
        meta: { currency, amount, eventType },
      }).catch(() => {});
      return { handled: true, action: 'balance_debited' };
    }

    default:
      console.log(`[Wise] Unhandled webhook event: ${eventType}`);
      return { handled: false, eventType };
  }
}

/**
 * Get payout status by transfer ID.
 * @param {string} transferId
 * @returns {Promise<{status: string, transfer?: Object}>}
 */
async function getPayoutStatus(transferId) {
  const token = getToken();
  if (!token) {
    return { status: 'unknown', error: 'WISE_NOT_CONFIGURED' };
  }

  try {
    const transfer = await getTransfer(transferId);
    return {
      status: mapWiseStatus(transfer.status),
      transfer,
    };
  } catch (err) {
    return { status: 'unknown', error: err.message };
  }
}

module.exports = {
  isConfigured,
  getProfileId,
  createRecipient,
  createQuote,
  createTransfer,
  fundTransfer,
  getTransfer,
  cancelTransfer,
  executePayout,
  verifyWebhook,
  handleWebhookEvent,
  getPayoutStatus,
  mapWiseStatus,
};
