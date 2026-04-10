'use strict';
/**
 * DsarRequest — Phase 8 Data Subject Access Request (GDPR, CCPA, LGPD, PIPEDA).
 * Tracks export, deletion, and other privacy requests.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type:         { type: String, enum: ['export', 'delete', 'rectification', 'restriction'], required: true, index: true },
    status:       { type: String, enum: ['pending', 'processing', 'completed', 'rejected'], default: 'pending', index: true },
    lawBasis:     { type: String, enum: ['gdpr', 'ccpa', 'lgpd', 'pipeda'], default: 'gdpr' },
    requestedAt:  { type: Date, default: Date.now },
    completedAt:  { type: Date, default: null },
    exportUrl:    { type: String, default: null },
    deletionScheduledAt: { type: Date, default: null },
    ip:           { type: String, default: null },
    userAgent:    { type: String, default: null },
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, type: 1, createdAt: -1 });
schema.index({ status: 1, type: 1 });

module.exports = mongoose.model('DsarRequest', schema);
