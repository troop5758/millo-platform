/**
 * MoneyIndex — unified money lookup (single collection).
 * Write-through on payment reference, payment transaction, and payout flows.
 * GET /money/:refId resolves by refId, providerId, or sourceId (Mongo ObjectId).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const TYPE_ENUM = ['payment', 'payout', 'refund', 'adjustment', 'chargeback'];

const schema = new mongoose.Schema(
  {
    /** Stable public id (UUID) for GET /money/:refId */
    refId: { type: String, required: true, index: true, trim: true },
    type: { type: String, required: true, enum: TYPE_ENUM, index: true },
    provider: { type: String, required: true, trim: true, index: true },
    /** Processor reference (e.g. pi_*, cs_*, Wise transfer id) or internal key `tx:ObjectId` / `payout:ObjectId` */
    providerId: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    amountCents: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    status: { type: String, required: true, default: 'pending', index: true },
    /** Trace back to originating document */
    sourceKind: { type: String, trim: true, index: true },
    sourceId: { type: mongoose.Schema.Types.ObjectId, index: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Optional idempotency key for the originating money mutation (sparse unique). */
    idempotencyKey: { type: String, trim: true, sparse: true, index: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ refId: 1 }, { unique: true });
schema.index({ provider: 1, providerId: 1 }, { unique: true });
schema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
schema.index({ sourceKind: 1, sourceId: 1 }, { sparse: true });
schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('MoneyIndex', schema);
