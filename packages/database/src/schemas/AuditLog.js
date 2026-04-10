/**
 * AuditLog — MongoDB schema (general). https://milloapp.com
 * Fields: action (required), actorId (ref User), userId (subject user when applicable),
 * adminId (admin performing override), reason (short string / code), resourceType, resourceId, meta (mixed). Timestamps.
 * Indexes: action+createdAt, actorId+createdAt, resourceType+resourceId, userId, adminId.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    /** Subject user for account-level actions (e.g. ban). */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    /** Admin who performed the action (mirrored to actorId when actorId omitted). */
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    reason: { type: String },
    resourceType: { type: String },
    resourceId: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ action: 1, createdAt: -1 });
schema.index({ actorId: 1, createdAt: -1 });
schema.index({ resourceType: 1, resourceId: 1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ adminId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', schema);
