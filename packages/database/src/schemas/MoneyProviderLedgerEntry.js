/**
 * MoneyProviderLedgerEntry — enterprise provider ledger (Stripe / PayPal / Wise).
 * Distinct from wallet LedgerEntry (credit/debit sequence). Idempotency via unique idempotencyKey.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const TYPE_ENUM = ['payment', 'payout', 'refund'];
const PROVIDER_ENUM = ['stripe', 'paypal', 'wise'];
const STATUS_ENUM = ['pending', 'completed', 'failed'];

const schema = new mongoose.Schema(
  {
    type: { type: String, required: true, enum: TYPE_ENUM },
    provider: { type: String, required: true, enum: PROVIDER_ENUM },
    providerId: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** Minor currency units (e.g. cents). */
    amount: { type: Number, required: true },
    status: { type: String, required: true, enum: STATUS_ENUM, default: 'pending' },
    idempotencyKey: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true, strict: true }
);

schema.index({ idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ provider: 1, providerId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('MoneyProviderLedgerEntry', schema);
