/**
 * PlatformMetric — Phase 12 Analytics. Daily snapshots of key metrics.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    date:         { type: Date, required: true, index: true },
    metric:       { type: String, required: true, enum: ['dau', 'mau', 'creator_revenue_cents', 'arpu_cents', 'retention_pct', 'conversion_pct'], index: true },
    value:        { type: Number, required: true },
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ date: 1, metric: 1 }, { unique: true });

module.exports = mongoose.model('PlatformMetric', schema);
