/**
 * Moderation — Per-user shadow ban state (reason, expiresAt). Syncs to User/Profile for fast lookup.
 * Shadow-banned: videos down-ranked in FYP, comments hidden, live visibility reduced.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    shadowBanned: { type: Boolean, default: false, index: true },
    reason:       { type: String, default: '' },
    expiresAt:    { type: Date, default: null, index: true },
    setAt:        { type: Date, default: Date.now },
    setBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, _id: true }
);

schema.index({ expiresAt: 1 }, { sparse: true });

module.exports = mongoose.model('Moderation', schema);
