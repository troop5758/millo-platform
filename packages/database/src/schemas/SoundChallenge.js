/**
 * SoundChallenge — Brand-paid sound challenge (e.g. "Nike challenge sound"). Brands pay for sound promotion.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    trackId:          { type: mongoose.Schema.Types.ObjectId, ref: 'MusicTrack', required: true, index: true },
    brandName:        { type: String, required: true, trim: true },
    brandId:          { type: String, default: null, trim: true },
    challengeName:    { type: String, required: true, trim: true },
    description:      { type: String, default: '', trim: true },
    startAt:          { type: Date, required: true, index: true },
    endAt:            { type: Date, required: true, index: true },
    status:           { type: String, enum: ['draft', 'active', 'paused', 'ended'], default: 'draft', index: true },
    imageUrl:         { type: String, default: null, trim: true },
    bannerUrl:        { type: String, default: null, trim: true },
    prizeDescription: { type: String, default: '', trim: true },
    rules:            { type: String, default: '', trim: true },
    budgetCents:       { type: Number, default: 0 },
    meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ status: 1, startAt: 1, endAt: 1 });

module.exports = mongoose.model('SoundChallenge', schema);
