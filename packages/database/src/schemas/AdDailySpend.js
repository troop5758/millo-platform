/**
 * AdDailySpend — budget pacing (Phase 8). https://milloapp.com
 * Fields: campaignId (ref Campaign, required), date (required), amountCents (required, default 0), meta (mixed). Timestamps.
 * Indexes: campaignId+date (unique).
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    date: { type: Date, required: true },
    amountCents: { type: Number, required: true, default: 0 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ campaignId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('AdDailySpend', schema);
