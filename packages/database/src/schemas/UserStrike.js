/**
 * UserStrike — Phase 14 Trust & Safety. Per-user strike history.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const strikeEntrySchema = new mongoose.Schema(
  {
    reason:       { type: String, required: true },
    targetType:   { type: String },
    targetId:     { type: String },
    reportId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    moderatorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt:    { type: Date },
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: true, timestamps: true }
);

const schema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    strikeCount:  { type: Number, default: 0 },
    strikes:      [strikeEntrySchema],
    lastStrikeAt: { type: Date },
    status:       { type: String, enum: ['active', 'suspended', 'banned'], default: 'active', index: true },
    suspendedUntil: { type: Date },
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 });
schema.index({ status: 1 });

module.exports = mongoose.model('UserStrike', schema);
