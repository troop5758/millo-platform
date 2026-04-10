/**
 * LoginAudit — Account Takeover Protection. One record per login attempt (success or failure).
 * Stores IP, geo (country, city, lat/lon), device fingerprint, userAgent for impossible-travel detection.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ip:                { type: String, index: true },
    country:           { type: String },
    city:              { type: String },
    latitude:          { type: Number },
    longitude:         { type: Number },
    deviceFingerprint: { type: String, index: true },
    userAgent:         { type: String },
    loginSuccess:      { type: Boolean, default: true, index: true },
    createdAt:         { type: Date, default: Date.now },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('LoginAudit', schema);
