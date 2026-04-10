/**
 * DMSession — DM monetization session (Phase 6.2). https://milloapp.com
 * Fields: creatorId (ref User, required), userId (ref User, required), startedAt (required), endedAt, totalMinutes, freeBufferMinutes, billableMinutes, approved, charged, amountCents, meta (mixed). Timestamps.
 * Indexes: creatorId+createdAt, userId+createdAt, approved+charged.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    totalMinutes: { type: Number, default: 0 },
    freeBufferMinutes: { type: Number, default: 0 },
    billableMinutes: { type: Number, default: 0 },
    approved: { type: Boolean, default: false },
    charged: { type: Boolean, default: false },
    amountCents: { type: Number, default: 0 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ approved: 1, charged: 1 });

module.exports = mongoose.model('DMSession', schema);
