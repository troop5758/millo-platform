/**
 * TrustScore — MongoDB schema (level-trust). https://milloapp.com
 * Fields: userId (ref User, required), score (required, default 0), source, meta (mixed). Timestamps.
 * Indexes: userId+createdAt, score.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true, default: 0 },
    source: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ score: -1 });

module.exports = mongoose.model('TrustScore', schema);
