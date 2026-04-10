/**
 * ConsentLog — GDPR consent logging (Phase 11). https://milloapp.com
 * Fields: userId (ref User, required), purpose (required), version, granted (required), ip, userAgent, meta (mixed). Timestamps.
 * Indexes: userId+createdAt, purpose+createdAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, required: true },
    version: { type: String },
    granted: { type: Boolean, required: true },
    ip: { type: String },
    userAgent: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ purpose: 1, createdAt: -1 });

module.exports = mongoose.model('ConsentLog', schema);
