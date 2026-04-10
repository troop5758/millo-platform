'use strict';
/**
 * HashtagTrend — aggregated metrics per hashtag for trend manipulation detection and dashboards.
 * usageCount, uniqueCreators, geoSpread, suspiciousClusterScore; updated when trend checks run.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    hashtag:              { type: String, required: true, unique: true, index: true },
    usageCount:           { type: Number, default: 0 },
    uniqueCreators:       { type: Number, default: 0 },
    geoSpread:            { type: Number, default: 0 },   // 0–100 or distinct regions ratio
    suspiciousClusterScore: { type: Number, default: 0 }, // 0–100, higher = more suspicious
    lastUpdated:          { type: Date, default: Date.now },
  },
  { timestamps: true, _id: true }
);

schema.index({ lastUpdated: -1 });
schema.index({ suspiciousClusterScore: -1 });

module.exports = mongoose.model('HashtagTrend', schema);
