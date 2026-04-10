/**
 * Battle — MongoDB schema. https://milloapp.com
 * Fields: status (enum pending|active|completed|cancelled), startedAt, endedAt, winnerId, meta (mixed). Timestamps.
 * Indexes: status, startedAt, winnerId.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    status: { type: String, enum: ['pending', 'active', 'completed', 'cancelled'], default: 'pending' },
    startedAt: { type: Date },
    endedAt: { type: Date },
    winnerId: { type: mongoose.Schema.Types.ObjectId },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ status: 1 });
schema.index({ startedAt: -1 });
schema.index({ winnerId: 1 });

module.exports = mongoose.model('Battle', schema);
