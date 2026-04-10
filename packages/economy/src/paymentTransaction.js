/**
 * Payment Transaction Record — every financial event must be recorded.
 * https://milloapp.com
 */
const db = require('@millo/database');

const TYPES = ['subscription', 'ppv', 'gift', 'shop_purchase', 'auction_payment', 'live_ticket'];
const STATUSES = ['pending', 'completed', 'failed', 'refunded'];

/**
 * Record a payment transaction for audit and reporting.
 * @param {Object} opts
 * @param {string} opts.type - subscription | ppv | gift | shop_purchase | auction_payment | live_ticket
 * @param {number} opts.grossAmountCents
 * @param {number} [opts.platformFeeCents=0]
 * @param {number} [opts.creatorAmountCents=0]
 * @param {ObjectId} [opts.userId] - payer
 * @param {ObjectId} [opts.creatorId] - recipient (null for shop_purchase)
 * @param {string} [opts.currency='USD']
 * @param {string} [opts.paymentProcessor]
 * @param {string} [opts.status='completed'] - pending | completed | failed | refunded
 * @param {string} [opts.moneyProvider] - override MoneyIndex provider (e.g. stripe)
 * @param {string} [opts.moneyProviderId] - override MoneyIndex providerId (e.g. pi_*)
 */
async function recordPaymentTransaction(opts) {
  const {
    type,
    grossAmountCents = 0,
    platformFeeCents = 0,
    creatorAmountCents = 0,
    userId,
    creatorId,
    currency = 'USD',
    paymentProcessor,
    status = 'completed',
  } = opts || {};
  if (!type || !TYPES.includes(type)) return null;
  if (!STATUSES.includes(status)) return null;
  const doc = await db.PaymentTransaction.create({
    userId: userId || undefined,
    creatorId: creatorId || undefined,
    type,
    grossAmountCents,
    platformFeeCents,
    creatorAmountCents,
    currency,
    paymentProcessor: paymentProcessor || undefined,
    status,
  });
  const { upsertFromPaymentTransaction } = require('./moneyIndexWrite');
  upsertFromPaymentTransaction(doc.toObject ? doc.toObject() : doc, {
    provider: opts?.moneyProvider,
    providerId: opts?.moneyProviderId,
  }).catch(() => {});
  return doc;
}

module.exports = { recordPaymentTransaction, TYPES, STATUSES };
