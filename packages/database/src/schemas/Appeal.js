/**
 * Appeal — moderation appeals (Phase 10). https://milloapp.com
 * Fields: reportId (ref Report), userId (ref User, required), reason, status (enum pending|upheld|overturned), decidedBy (ref User), decidedAt, meta (mixed). Timestamps.
 * Indexes: userId+createdAt, status, reportId.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String },
    status: { type: String, enum: ['pending', 'upheld', 'overturned'], default: 'pending' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1 });
schema.index({ reportId: 1 });

module.exports = mongoose.model('Appeal', schema);
