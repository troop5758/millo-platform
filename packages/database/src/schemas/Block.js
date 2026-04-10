/**
 * Block — MongoDB schema. Blocked users system.
 * Fields: blockerId (ref User), blockedUserId (ref User). Timestamps.
 * Indexes: blockerId+blockedUserId (unique), blockedUserId.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    blockerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blockedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ blockerId: 1, blockedUserId: 1 }, { unique: true });
schema.index({ blockedUserId: 1 });

module.exports = mongoose.model('Block', schema);
