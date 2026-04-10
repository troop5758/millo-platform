/**
 * SponsoredSound — Brand-paid promotion of a sound. Brands pay for sound promotion.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    trackId:      { type: mongoose.Schema.Types.ObjectId, ref: 'MusicTrack', required: true, index: true },
    brandName:    { type: String, required: true, trim: true },
    brandId:      { type: String, default: null, trim: true },
    startAt:      { type: Date, required: true, index: true },
    endAt:        { type: Date, required: true, index: true },
    budgetCents:  { type: Number, default: 0 },
    status:       { type: String, enum: ['draft', 'active', 'paused', 'ended'], default: 'draft', index: true },
    priority:     { type: Number, default: 0 },
    targetRegions: [{ type: String, trim: true }],
    targetGenres:  [{ type: String, trim: true }],
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ status: 1, startAt: 1, endAt: 1 });
schema.index({ status: 1, priority: -1 });

module.exports = mongoose.model('SponsoredSound', schema);
