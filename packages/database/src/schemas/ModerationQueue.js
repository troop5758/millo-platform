/**
 * ModerationQueue — human review queue when AI moderation is disabled (shadow moderation mode).
 * Flagged content is queued here for moderator review. https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    contentId:   { type: String, required: true, index: true },
    contentType: { type: String, required: true, index: true },
    contentUrl:  { type: String },
    uploaderId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    reason:      { type: String },
    status:      { type: String, enum: ['pending', 'reviewing', 'approved', 'rejected'], default: 'pending', index: true },
    reviewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt:   { type: Date },
    reviewNote:   { type: String },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ status: 1, createdAt: 1 });
schema.index({ uploaderId: 1, createdAt: -1 });

module.exports = mongoose.model('ModerationQueue', schema);
