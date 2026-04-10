/**
 * TVPairingCode — short-lived code for TV device pairing (Phase 12). https://milloapp.com
 * Fields: code (required), userId (ref User, required), expiresAt (required), usedAt. Timestamps.
 * Indexes: code (unique), expiresAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true, _id: true }
);

schema.index({ code: 1 }, { unique: true });
schema.index({ expiresAt: 1 });

module.exports = mongoose.model('TVPairingCode', schema);
