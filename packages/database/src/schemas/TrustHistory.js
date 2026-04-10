/**
 * TrustHistory — Historical trust score snapshots for timeline/charts.
 * One document per snapshot; written by trust score engine and snapshot worker.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    trustScore: { type: Number, required: true, min: 0, max: 100 },
    factors:    { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('TrustHistory', schema);
