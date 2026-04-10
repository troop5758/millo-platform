/**
 * PpvAnalytics — aggregated analytics per PPV stream (views, revenue, conversions).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId:      { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    creatorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date:          { type: Date, required: true, index: true }, // day bucket
    purchaseCount: { type: Number, default: 0 },
    revenueCents:  { type: Number, default: 0 },
    uniqueViewers: { type: Number, default: 0 },
    peakViewers:   { type: Number, default: 0 },
    meta:          { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ streamId: 1, date: 1 }, { unique: true });
schema.index({ creatorId: 1, date: -1 });

module.exports = mongoose.model('PpvAnalytics', schema);
