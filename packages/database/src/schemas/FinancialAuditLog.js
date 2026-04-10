/**
 * FinancialAuditLog — every financial mutation must be logged. https://milloapp.com
 * Fields: action (required), walletId (ref Wallet), amountCents, balanceAfterCents, refType, refId, actorId (ref User), meta (mixed). Timestamps.
 * Indexes: action+createdAt, walletId+createdAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    amountCents: { type: Number },
    balanceAfterCents: { type: Number },
    refType: { type: String },
    refId: { type: String },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ action: 1, createdAt: -1 });
schema.index({ walletId: 1, createdAt: -1 });

module.exports = mongoose.model('FinancialAuditLog', schema);
