/**
 * PpvContentAnalytics — analytics per PPV content for pricing AI, discovery, dashboards.
 * Views, clicks, purchases, revenue, conversion_rate.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    contentId:      { type: mongoose.Schema.Types.ObjectId, ref: 'PpvContent', required: true, index: true },
    creatorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date:           { type: Date, required: true, index: true },
    views:          { type: Number, default: 0 },
    clicks:         { type: Number, default: 0 },
    purchases:      { type: Number, default: 0 },
    revenueCents:   { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    meta:           { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ contentId: 1, date: 1 }, { unique: true });
schema.index({ creatorId: 1, date: -1 });

module.exports = mongoose.model('PpvContentAnalytics', schema);
