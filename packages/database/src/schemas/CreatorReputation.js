/**
 * CreatorReputation — Dynamic 0–100 reputation score per creator (CRS).
 * Data model: creatorId, reputationScore, metrics, monetizationStatus, lastUpdated.
 * Controls: payout eligibility, livestream monetization, storefront, auctions, algorithmic promotion.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const BANDS = ['trusted', 'good_standing', 'monetization_limited', 'high_risk', 'monetization_disabled'];

const schema = new mongoose.Schema(
  {
    creatorId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    score:            { type: Number, required: true, min: 0, max: 100 },
    reputationScore:  { type: Number, min: 0, max: 100 },
    band:             { type: String, enum: BANDS, required: true },
    metrics:          {
      contentAuthenticity:  { type: Number, default: 0 },
      audienceAuthenticity: { type: Number, default: 0 },
      refundRate:           { type: Number, default: 0 },
      chargebackRate:       { type: Number, default: 0 },
      abuseReports:         { type: Number, default: 0 },
      moderationStrikes:    { type: Number, default: 0 },
      accountTrustScore:    { type: Number, default: 0 },
    },
    monetizationStatus: {
      giftsEnabled:         { type: Boolean, default: false },
      subscriptionsEnabled: { type: Boolean, default: false },
      storefrontEnabled:    { type: Boolean, default: false },
      auctionsEnabled:      { type: Boolean, default: false },
    },
    factors:          {
      accountTrustScore:       { type: Number, default: 0 },
      creatorManipulation:     { type: Boolean, default: false },
      contentAuthenticityAvg:  { type: Number, default: 0 },
      audienceAuthenticity:   { type: Number, default: 0 },
      monetizationBehavior:   { type: Number, default: 0 },
      refundRateScore:        { type: Number, default: 0 },
      reportRateScore:        { type: Number, default: 0 },
      paymentHistoryScore:    { type: Number, default: 0 },
      communityReputation:   { type: Number, default: 0 },
    },
    lastUpdated:      { type: Date, default: Date.now },
    /** Phase 4 monetization trust score (may be negative); independent of CRS 0–100. */
    phase4Trust: {
      score:              { type: Number },
      followerFeature:    { type: Number },
      watchFeature:       { type: Number },
      violationPenalty:   { type: Number },
      fraudSignals:       { type: Number },
      followerCount:      { type: Number },
      totalWatchHours:    { type: Number },
      updatedAt:          { type: Date },
    },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1 }, { unique: true });
schema.index({ score: -1 });
schema.index({ reputationScore: -1 });
schema.index({ band: 1 });

module.exports = mongoose.model('CreatorReputation', schema);
module.exports.CRS_BANDS = BANDS;
