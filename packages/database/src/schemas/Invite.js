/**
 * Invite — MongoDB schema. https://milloapp.com
 * Fields: code (required), inviterId (ref User, required), inviteeId (ref User), usedAt, expiresAt, meta (mixed). Timestamps.
 * Indexes: code (unique), inviterId+createdAt, expiresAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    inviterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    inviteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    usedAt: { type: Date },
    expiresAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ code: 1 }, { unique: true });
schema.index({ inviterId: 1, createdAt: -1 });
schema.index({ expiresAt: 1 });

module.exports = mongoose.model('Invite', schema);
