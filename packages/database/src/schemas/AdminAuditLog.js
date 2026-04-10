/**
 * AdminAuditLog — every admin override must be logged. https://milloapp.com
 * Fields: action (required), adminId (ref User, required), targetType, targetId, overrideReason, meta (mixed). Timestamps.
 * Indexes: action+createdAt, adminId+createdAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for system events (e.g. webhooks)
    targetType: { type: String },
    targetId: { type: String },
    overrideReason: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ action: 1, createdAt: -1 });
schema.index({ adminId: 1, createdAt: -1 });
schema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', schema);
