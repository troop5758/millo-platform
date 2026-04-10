/**
 * TrustEdge — directed trust/risk graph edges (admin trust dashboard, bot graph signals).
 * Query outgoing: `TrustEdge.find({ from: userId })`.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const EDGE_TYPES = ['device_link', 'gift', 'follow', 'co_fingerprint', 'payment_cluster', 'engagement', 'other'];

const schema = new mongoose.Schema(
  {
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    edgeType: { type: String, enum: EDGE_TYPES, default: 'other', index: true },
    /** Relative strength / confidence (0–100 or unbounded per pipeline). */
    weight: { type: Number, default: 1 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ from: 1, to: 1, edgeType: 1 }, { unique: true });
schema.index({ from: 1, updatedAt: -1 });

module.exports = mongoose.model('TrustEdge', schema);
