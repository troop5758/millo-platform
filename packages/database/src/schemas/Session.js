/**
 * Session — MongoDB schema. https://milloapp.com
 * Session registry + device management: userId, token, deviceId, deviceName, ip, userAgent,
 * location, lastSeen, revoked. Optional refreshTokenHash for future refresh-token flow.
 * Indexes: userId, token (unique), expiresAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token:           { type: String, required: true, index: true },
    tokenHash:       { type: String },
    refreshTokenHash: { type: String },
    expiresAt:       { type: Date, required: true },
    deviceId:        { type: String, index: true },
    deviceName:      { type: String },
    ip:              { type: String },
    ipAddress:       { type: String },
    userAgent:       { type: String },
    location:        { type: String },
    lastSeen:        { type: Date, default: Date.now },
    lastActiveAt:    { type: Date, default: Date.now },
    revoked:         { type: Boolean, default: false, index: true },
    revokedAt:       { type: Date },
    meta:            { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 });
schema.index({ token: 1 }, { unique: true });
schema.index({ expiresAt: 1 });
schema.index({ userId: 1, revoked: 1 });
/** Session tracking / analytics — lookups by user + device or user + IP over time */
schema.index({ userId: 1, deviceId: 1, createdAt: -1 });
schema.index({ userId: 1, ip: 1, createdAt: -1 });

module.exports = mongoose.model('Session', schema);
