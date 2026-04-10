/**
 * MusicTrackEarning — Artist earnings when song trends (platform rev share).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    trackId:   { type: mongoose.Schema.Types.ObjectId, ref: 'MusicTrack', required: true, index: true },
    artistId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amountCents: { type: Number, required: true },
    period:    { type: String, default: '' },   // e.g. '2026-02' for monthly
    source:    { type: String, enum: ['trending', 'usage', 'payout'], default: 'trending', index: true },
    paidAt:    { type: Date, default: null },
    meta:      { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ artistId: 1, period: -1 });

module.exports = mongoose.model('MusicTrackEarning', schema);
