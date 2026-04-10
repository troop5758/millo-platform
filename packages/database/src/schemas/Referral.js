'use strict';
/**
 * Referral — Phase 6 Referral System.
 * referrer_id, new_user_id, reward_amount, status, created_at.
 * Viewer referral → coins; creator referral → revenue share.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    referrerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    newUserId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    rewardAmount:   { type: Number, default: 0 },           // cents for coins, or % for revenue share
    rewardType:     { type: String, enum: ['coins', 'revenue_share'], default: 'coins' },
    status:         { type: String, enum: ['pending', 'qualified', 'rewarded', 'expired'], default: 'pending', index: true },
    inviteCode:     { type: String, default: null, index: true },
    meta:           { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ referrerId: 1, createdAt: -1 });
schema.index({ newUserId: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Referral', schema);
