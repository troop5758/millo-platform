/**
 * FraudEvent — Phase 11 Fraud Prevention. Logs fraud check events.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    eventType:        { type: String, enum: ['payment', 'login', 'signup', 'payout', 'order', 'ppv_unlock', 'gift', 'viewer_spike', 'sound_gaming', 'enforcement', 'trend_manipulation', 'subscription_fraud', 'creator_revenue_spike', 'auction_fraud'], required: true, index: true },
    action:           { type: String, enum: ['allow', 'review', 'block'], default: 'allow', index: true },
    riskScore:        { type: Number, min: 0, max: 100 },
    signals:          [{ type: String }],
    provider:         { type: String, enum: ['internal', 'stripe_radar', 'sift', 'riskified'], default: 'internal' },
    ip:               { type: String },
    userAgent:        { type: String },
    deviceFingerprint:{ type: String, index: true },
    refType:          { type: String },
    refId:            { type: String },
    meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ eventType: 1, createdAt: -1 });
schema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('FraudEvent', schema);
