/**
 * FanProfile — behavioral profile for each viewer. Used for segmentation and targeting.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    creatorsFollowed:    { type: Number, default: 0 },
    subscriptions:      { type: Number, default: 0 },
    totalSpent:         { type: Number, default: 0 },   // cents
    ppvPurchases:       { type: Number, default: 0 },
    coinsSpent:         { type: Number, default: 0 },
    engagementScore:    { type: Number, default: 0 },
    segment:            {
      type: String,
      enum: ['free_viewer', 'engaged_viewer', 'subscriber', 'high_value_fan', 'super_fan'],
      default: 'free_viewer',
      index: true,
    },
    lastComputedAt:     { type: Date, default: null },
    meta:               { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ segment: 1 });
schema.index({ engagementScore: -1 });
schema.index({ totalSpent: -1 });

module.exports = mongoose.model('FanProfile', schema);
