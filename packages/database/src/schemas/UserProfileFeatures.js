/**
 * UserProfileFeatures — aggregated user signals for discovery / ranking (TikTok-style pipeline).
 * One row per user; updated by batch or streaming feature jobs.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, unique: true },
    locale: { type: String, default: 'en-US' },
    country: { type: String, default: 'US' },
    language: { type: String, default: 'en' },
    accountAgeDays: { type: Number, default: 0 },
    followsCount: { type: Number, default: 0 },
    followersCount: { type: Number, default: 0 },
    avgSessionMinutes7d: { type: Number, default: 0 },
    avgWatchTime7d: { type: Number, default: 0 },
    shortSkipRate7d: { type: Number, default: 0 },
    likeRate7d: { type: Number, default: 0 },
    commentRate7d: { type: Number, default: 0 },
    shareRate7d: { type: Number, default: 0 },
    followRate7d: { type: Number, default: 0 },
    purchaseRate30d: { type: Number, default: 0 },
    giftRate30d: { type: Number, default: 0 },
    creatorAffinityTop: { type: [String], default: [] },
    categoryAffinityTop: { type: [String], default: [] },
    embedding: { type: [Number], default: [] },
  },
  { _id: true, timestamps: true }
);

schema.index({ updatedAt: -1 });

module.exports = mongoose.model('UserProfileFeatures', schema);
