/**
 * DeviceAnalytics — MongoDB schema. Live stream viewer device tracking.
 * Fields: streamId (ref LiveStream), device (mobile|desktop|tablet), os, browser. Timestamps.
 * Indexes: streamId+createdAt for analytics queries.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true },
    device: {
      type: String,
      enum: ['mobile', 'desktop', 'tablet'],
      default: 'desktop',
    },
    os: { type: String, default: null },
    browser: { type: String, default: null },
  },
  { timestamps: true, _id: true }
);

schema.index({ streamId: 1, createdAt: -1 });
schema.index({ streamId: 1, device: 1 });

module.exports = mongoose.model('DeviceAnalytics', schema);
