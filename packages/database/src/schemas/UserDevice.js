/**
 * UserDevice — push notification devices (user_devices). Phase 3.
 * Fields: userId, deviceToken, platform (fcm | apns | expo). Timestamps.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceToken:  { type: String, required: true, index: true },
    platform:     { type: String, enum: ['fcm', 'apns', 'expo'], default: 'expo', index: true },
    lastSeenAt:   { type: Date, default: Date.now },
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, deviceToken: 1 }, { unique: true });
schema.index({ userId: 1, platform: 1 });

module.exports = mongoose.model('UserDevice', schema, 'user_devices');
