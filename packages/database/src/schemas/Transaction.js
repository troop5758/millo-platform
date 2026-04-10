/**
 * Transaction — wallet-scoped line items (parallel to LedgerEntry for wallet UI / DSAR).
 * CRITICAL: Authoritative money log is LedgerEntry (append-only, sequenced); every credit/debit should also append there via economy.coins.
 *
 * Fields:
 * - direction: credit | debit (ledger sense; aligns with LedgerEntry.type)
 * - type: legacy business ref key (e.g. gift, coin_purchase) — same as refType on create
 * - source: coarse category (GIFT, SUBSCRIPTION, AD, …) for reporting
 * - status: pending | completed (reserved for async settlement)
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const SOURCE_VALUES = [
  'AD',
  'GIFT',
  'SUBSCRIPTION',
  'SHOP',
  'COIN_PURCHASE',
  'PPV',
  'TICKET',
  'AUCTION',
  'ADMIN',
  'OTHER',
];

const schema = new mongoose.Schema(
  {
    walletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true },
    /** @deprecated Use `direction` + `type` (business ref); kept for backward compatibility — historically same as business refType. */
    type: { type: String, required: true },
    direction: { type: String, enum: ['credit', 'debit'] },
    source: { type: String, enum: SOURCE_VALUES, default: 'OTHER' },
    status: { type: String, enum: ['pending', 'completed'], default: 'completed' },
    amountCents: { type: Number, required: true },
    refId: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ walletId: 1, createdAt: -1 });
schema.index({ type: 1 });
schema.index({ refId: 1 });
schema.index({ direction: 1, createdAt: -1 });
schema.index({ source: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', schema);
