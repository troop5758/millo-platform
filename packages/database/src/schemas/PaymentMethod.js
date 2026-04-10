/**
 * PaymentMethod — stored payment methods users attach (card, PayPal, Apple Pay, Google Pay).
 * https://milloapp.com
 * Fields: userId, provider, providerPaymentId, last4, brand. Timestamps.
 * Indexes: userId+createdAt, userId+providerPaymentId (unique).
 */
const mongoose = require('mongoose');

const PROVIDER_ENUM = ['stripe_card', 'paypal', 'apple_pay', 'google_pay'];

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provider: { type: String, required: true, enum: PROVIDER_ENUM },
    providerPaymentId: { type: String },
    last4: { type: String },
    brand: { type: String },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, providerPaymentId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PaymentMethod', schema);
