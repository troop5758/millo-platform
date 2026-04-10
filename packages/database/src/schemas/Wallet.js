/**
 * Wallet — MongoDB schema. https://milloapp.com
 * Core balances (all amounts in **cents** — no float money):
 * - balanceCents — available / spendable (maps to “balance” in product copy)
 * - lockedCents — pending / held (maps to “pending” in product copy)
 * - lifetimeEarnings — cumulative earned or loaded per product rules
 * Mutations must go through @millo/economy (credit/debit) + LedgerEntry; do not patch balances ad hoc.
 * Fields: userId (ref User, required), currency (default 'USD'). Timestamps.
 * Indexes: userId (unique), currency.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    currency: { type: String, default: 'USD' },
    balanceCents: { type: Number, default: 0 },       // available balance (spendable)
    lockedCents: { type: Number, default: 0 },       // pending balance (held)
    lifetimeEarnings: { type: Number, default: 0 },   // total ever earned (creator) or loaded (viewer)
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 }, { unique: true });
schema.index({ currency: 1 });

module.exports = mongoose.model('Wallet', schema);
