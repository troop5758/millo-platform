/**
 * ModerationLog — MongoDB schema. https://milloapp.com
 * Fields: moderatorId (ref User, required), targetType (required), targetId (required), action (required), meta (mixed). Timestamps.
 * Indexes: moderatorId+createdAt, targetType+targetId.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    moderatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    action: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ moderatorId: 1, createdAt: -1 });
schema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('ModerationLog', schema);
