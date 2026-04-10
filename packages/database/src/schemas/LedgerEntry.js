/**
 * LedgerEntry — **authoritative append-only transaction ledger** (MongoDB). No in-place updates; every money movement is a new row.
 * SQL mirror optional: packages/database/sql/ledger_optional.sql.
 * Pair with Wallet balance updates only via economy.coins (credit/debit) which calls appendEntry.
 * Fields: sequence (global monotonic, unique), type credit|debit, actorId, amountCents (debits negative), balanceAfterCents, refType, refId, meta.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    sequence: { type: Number, required: true },
    type: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId },
    amountCents: { type: Number, required: true },
    balanceAfterCents: { type: Number },
    refType: { type: String },
    refId: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true, strict: true }
);

schema.index({ sequence: 1 }, { unique: true });
schema.index({ type: 1, createdAt: -1 });
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ refId: 1 }, { sparse: true });
schema.index({ 'meta.paymentIntentId': 1 }, { sparse: true });

module.exports = mongoose.model('LedgerEntry', schema);
