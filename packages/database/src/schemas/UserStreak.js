'use strict';
/**
 * UserStreak — Phase 6 Retention. Daily streak rewards.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActiveAt:  { type: Date, default: null },
    totalRewardedCents: { type: Number, default: 0 },
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 }, { unique: true });
schema.index({ currentStreak: -1 });

module.exports = mongoose.model('UserStreak', schema);
