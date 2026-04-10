/**
 * TVDevice — paired TV device (Phase 12). Apple TV / Android TV. https://milloapp.com
 * Fields: userId (ref User, required), deviceId (required), platform (enum apple_tv|android_tv, required), lastSeenAt, meta (mixed). Timestamps.
 * Indexes: userId, deviceId (unique), platform.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    platform: { type: String, enum: ['apple_tv', 'android_tv'], required: true },
    lastSeenAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 });
schema.index({ deviceId: 1 }, { unique: true });
schema.index({ platform: 1 });

module.exports = mongoose.model('TVDevice', schema);
