/**
 * PaymentTransaction — Payment Transaction Record. Every financial event must be recorded.
 * https://milloapp.com
 * Fields: userId, creatorId, type, grossAmountCents, platformFeeCents, creatorAmountCents,
 *         currency, paymentProcessor, status. Timestamps.
 * Indexes: userId+createdAt, creatorId+createdAt, type, status.
 */
const mongoose = require('mongoose');

const TYPE_ENUM = [
  'subscription',
  'ppv',
  'gift',
  'shop_purchase',
  'auction_payment',
  'live_ticket',
];

const STATUS_ENUM = ['pending', 'completed', 'failed', 'refunded'];

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, required: true, enum: TYPE_ENUM },
    grossAmountCents: { type: Number, default: 0 },
    platformFeeCents: { type: Number, default: 0 },
    creatorAmountCents: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    paymentProcessor: { type: String, default: null },
    status: { type: String, required: true, enum: STATUS_ENUM, default: 'completed' },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ creatorId: 1, createdAt: -1 });
schema.index({ type: 1 });
schema.index({ status: 1 });

module.exports = mongoose.model('PaymentTransaction', schema);
