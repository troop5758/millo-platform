/**
 * AdImpression — MongoDB schema. https://milloapp.com
 * Fields: adId (ref Ad, required), userId (ref User), anonymousId, at (default now). Timestamps.
 * Indexes: adId+at, userId+at.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    anonymousId: { type: String },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true, _id: true }
);

schema.index({ adId: 1, at: -1 });
schema.index({ userId: 1, at: -1 });

module.exports = mongoose.model('AdImpression', schema);
