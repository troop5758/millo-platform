/**
 * PaymentReference — unified payment lookup by reference (Stripe, PayPal, Wise, coin).
 * GET /payments/reference/:ref queries by referenceId. https://milloapp.com
 */
const mongoose = require('mongoose');

const PROVIDER_ENUM = ['stripe', 'paypal', 'wise', 'coin', 'internal'];
const STATUS_ENUM = ['pending', 'completed', 'failed', 'refunded'];

const schema = new mongoose.Schema(
  {
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    provider:    { type: String, required: true, enum: PROVIDER_ENUM, index: true },
    referenceId: { type: String, required: true, index: true },
    status:      { type: String, required: true, enum: STATUS_ENUM, default: 'pending', index: true },
    amount:      { type: Number, default: 0 },
    amountCents: { type: Number, default: 0 },
    currency:    { type: String, default: 'USD' },
    metadata:    { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ referenceId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ provider: 1, status: 1 });

module.exports = mongoose.model('PaymentReference', schema);
