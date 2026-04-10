/**
 * ContentAuthenticity (CAS) — 0–100 authenticity score per content item.
 * Stores raw metrics used for scoring; updated as engagement events arrive.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    contentId:        { type: String, required: true, index: true },
    contentType:      { type: String, enum: ['video', 'livestream', 'post'], required: true, index: true },
    authenticityScore: { type: Number, required: true, min: 0, max: 100 },
    metrics:          {
      uniqueViewers:    { type: Number, default: 0 },
      totalViews:       { type: Number, default: 0 },
      avgWatchTime:     { type: Number, default: 0 },
      completionRate:   { type: Number, default: 0 },
      uniqueLikes:      { type: Number, default: 0 },
      uniqueComments:   { type: Number, default: 0 },
      deviceDiversity:  { type: Number, default: 0 },
      geoDiversity:     { type: Number, default: 0 },
      suspiciousVelocity: { type: Number, default: 0 },
    },
    lastUpdated:      { type: Date, default: Date.now },
  },
  { timestamps: true, _id: true }
);

schema.index({ contentId: 1, contentType: 1 }, { unique: true });
schema.index({ authenticityScore: -1 });

module.exports = mongoose.model('ContentAuthenticity', schema);
