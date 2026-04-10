/**
 * PPVContent — extended PPV content schema.
 * Supports: bundles, scheduled drops, subscriber discounts, region pricing, AI optimization.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:      { type: String, default: '' },
    description: { type: String, default: '' },
    contentType: {
      type: String,
      enum: ['video', 'image', 'post', 'download', 'livestream_replay'],
      index: true,
    },
    mediaUrl:    { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    basePriceCents: { type: Number, default: 0 },
    subscriberDiscountPercent: { type: Number, default: 20 },
    regionOverrides: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    bundleId:   { type: mongoose.Schema.Types.ObjectId, ref: 'PpvBundle', default: null, index: true },
    scheduledRelease: { type: Date, default: null, index: true },
    aiPriceEnabled: { type: Boolean, default: false },
    isActive:   { type: Boolean, default: true, index: true },
    streamId:   { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', default: null },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, isActive: 1 });
schema.index({ bundleId: 1, isActive: 1 });
schema.index({ scheduledRelease: 1, isActive: 1 });

module.exports = mongoose.model('PpvContent', schema);
