'use strict';
/**
 * Payment Service — core logic: payment, platform fee, creator payout allocation.
 * Creates PaymentTransaction, credits creator wallet (Wallet + CreatorWallet).
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');

const VALID_TYPES = ['subscription', 'ppv', 'gift', 'shop_purchase', 'auction_payment', 'live_ticket'];

/**
 * Process payment: allocate platform fee, credit creator, record transaction.
 * @param {Object} data
 * @param {ObjectId} data.userId - Payer
 * @param {ObjectId} data.creatorId - Recipient
 * @param {number} data.amountCents - Gross amount in cents
 * @param {number} data.platformFeePercent - Platform fee as decimal (e.g. 0.25 = 25%)
 * @param {string} data.type - subscription | ppv | gift | shop_purchase | auction_payment | live_ticket
 * @param {string} [data.refId] - Reference ID for ledger
 * @param {Object} [data.meta] - Additional metadata
 * @returns {Object} PaymentTransaction document
 */
async function processPayment(data) {
  const {
    userId,
    creatorId,
    amountCents,
    platformFeePercent = 0,
    type,
    refId = null,
    meta = {},
  } = data;

  if (!creatorId || amountCents == null || amountCents < 0) {
    throw new Error('processPayment requires creatorId and amountCents >= 0');
  }

  const validType = VALID_TYPES.includes(type) ? type : 'shop_purchase';
  const platformFeeCents = Math.round(amountCents * platformFeePercent);
  const creatorAmountCents = amountCents - platformFeeCents;

  const transaction = await db.PaymentTransaction.create({
    userId: userId || undefined,
    creatorId,
    type: validType,
    grossAmountCents: amountCents,
    platformFeeCents,
    creatorAmountCents,
    status: 'completed',
    currency: 'USD',
    ...meta,
  });

  if (creatorAmountCents > 0) {
    await economy.credit(creatorId, creatorAmountCents, validType, refId || String(transaction._id), {
      ...meta,
      paymentTransactionId: String(transaction._id),
    });
  }

  return transaction;
}

module.exports = { processPayment, VALID_TYPES };
