/**
 * PayoutRequest — creators request withdrawals. Admin approval flow (Phase 9).
 * Fields: userId (creator), amountCents, currency, provider (processor), status. https://milloapp.com
 * Indexes: idempotencyKey (unique), status+createdAt, userId+createdAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    provider: { type: String, enum: ['stripe', 'paypal', 'stripe_connect', 'wise', 'bank_transfer'], required: true },
    idempotencyKey: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'approved', 'rejected', 'paid', 'failed'], default: 'pending' },
    /** Payout hold system: when to allow processing. immediate = no delay; delay_24h = process after holdUntil; manual_review = admin must approve. */
    payoutRiskTier: { type: String, enum: ['immediate', 'delay_24h', 'manual_review'], default: 'immediate' },
    /** Earliest time this payout can be auto-processed (null = immediate). */
    holdUntil: { type: Date, default: null, index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    paidAt: { type: Date },
    externalId: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ idempotencyKey: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, holdUntil: 1 });
schema.index({ externalId: 1 }, { sparse: true });

module.exports = mongoose.model('PayoutRequest', schema);
