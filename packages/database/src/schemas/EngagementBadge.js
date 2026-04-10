'use strict';
/**
 * EngagementBadge — Phase 6 Retention. User-earned engagement badges.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    badgeId:    { type: String, required: true, index: true },
    badgeName:  { type: String, required: true },
    earnedAt:   { type: Date, default: Date.now },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, badgeId: 1 }, { unique: true });
schema.index({ badgeId: 1 });

module.exports = mongoose.model('EngagementBadge', schema);
