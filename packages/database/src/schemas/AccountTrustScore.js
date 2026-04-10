/**
 * AccountTrustScore — Dynamic 0–100 trust score snapshot per user (core anti-abuse engine).
 * One document per user; updated by trust score engine. Phase 3 / anti-abuse.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    score:      { type: Number, required: true, min: 0, max: 100 },
    riskLevel:  { type: String, enum: ['high', 'medium', 'low'], required: true },
    factors:    {
      accountAge:        { type: Number, default: 0 },
      deviceReputation:  { type: Number, default: 0 },
      behaviorScore:     { type: Number, default: 0 },
      paymentTrust:      { type: Number, default: 0 },
      socialGraphScore:  { type: Number, default: 0 },
      reportScore:       { type: Number, default: 0 },
    },
    updatedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 }, { unique: true });
schema.index({ score: -1 });
schema.index({ riskLevel: 1 });

module.exports = mongoose.model('AccountTrustScore', schema);
