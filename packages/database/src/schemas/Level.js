/**
 * Level — MongoDB schema (level-trust). https://milloapp.com
 * Fields: userId (ref User, required), level (required, default 1), xp (default 0), meta (mixed). Timestamps.
 * Indexes: userId (unique), level.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    level: { type: Number, required: true, default: 1 },
    xp: { type: Number, default: 0 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 }, { unique: true });
schema.index({ level: 1 });

module.exports = mongoose.model('Level', schema);
