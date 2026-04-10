/**
 * DeviceFingerprint — Phase 11 Fraud Prevention. Links device IDs to users for multi-account detection.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    fingerprint:     { type: String, required: true, index: true },
    userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    firstSeenAt:     { type: Date, default: Date.now },
    lastSeenAt:      { type: Date, default: Date.now },
    ip:              { type: String },
    userAgent:       { type: String },
    visitorId:       { type: String, index: true },
    timezone:        { type: String },
    screenResolution:{ type: String },
    meta:            { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ fingerprint: 1, userId: 1 }, { unique: true });
schema.index({ fingerprint: 1 });
schema.index({ userId: 1 });

module.exports = mongoose.model('DeviceFingerprint', schema);
