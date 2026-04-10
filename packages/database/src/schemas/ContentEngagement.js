'use strict';
/**
 * ContentEngagement — Phase 7 Discovery. Precomputed engagement metrics per content.
 * watch time, completion, likes, shares, comments, region popularity.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    contentId:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    contentType: { type: String, enum: ['stream', 'product'], required: true, index: true },
    likes:       { type: Number, default: 0 },
    shares:      { type: Number, default: 0 },
    comments:    { type: Number, default: 0 },
    saves:       { type: Number, default: 0 },
    watchTimeSeconds: { type: Number, default: 0 },
    viewCount:   { type: Number, default: 0 },
    playCount:   { type: Number, default: 0 },
    completedViews: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 },
    regionCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true, _id: true }
);

schema.index({ contentId: 1, contentType: 1 }, { unique: true });
schema.index({ contentType: 1, likes: -1 });
schema.index({ contentType: 1, watchTimeSeconds: -1 });

module.exports = mongoose.model('ContentEngagement', schema);
