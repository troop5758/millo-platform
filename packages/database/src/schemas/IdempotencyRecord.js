/**
 * IdempotencyRecord — billing/payout idempotency (Phase 9). https://milloapp.com
 * Fields: key (required), result (mixed), status (enum completed|failed), expiresAt, meta (mixed). Timestamps.
 * Indexes: key (unique), expiresAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    result: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
    expiresAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ key: 1 }, { unique: true });
schema.index({ expiresAt: 1 });

module.exports = mongoose.model('IdempotencyRecord', schema);
