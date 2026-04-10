/**
 * CreatorReviewQueue — Manual review queue for suspicious creators (monetization risk).
 * Fields: creatorId, riskScore, reason, status, assignedModerator.
 * Admin actions: approve payout, disable monetization, temporary suspension, permanent ban.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const STATUSES = ['pending', 'in_review', 'resolved'];
const RESOLUTIONS = ['approve_payout', 'disable_monetization', 'temporary_suspension', 'permanent_ban'];

const schema = new mongoose.Schema(
  {
    creatorId:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    riskScore:           { type: Number, required: true, min: 0, max: 100 },
    reason:              { type: String, required: true, trim: true, maxlength: 500 },
    status:              { type: String, enum: STATUSES, default: 'pending', index: true },
    assignedModerator:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    resolution:          { type: String, enum: RESOLUTIONS, default: null },
    resolvedBy:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt:         { type: Date, default: null },
    resolutionNote:     { type: String, default: '', maxlength: 1000 },
    meta:                { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, status: 1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ assignedModerator: 1, status: 1 });

module.exports = mongoose.model('CreatorReviewQueue', schema);
module.exports.STATUSES = STATUSES;
module.exports.RESOLUTIONS = RESOLUTIONS;
