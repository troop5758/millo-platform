/**
 * DMOfflineEvent — offline queue for DM monetization (Phase 6.2). https://milloapp.com
 * Fields: type (required), payload (mixed, required), processedAt, meta (mixed). Timestamps.
 * Indexes: processedAt, type+processedAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    processedAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ processedAt: 1 });
schema.index({ type: 1, processedAt: 1 });

module.exports = mongoose.model('DMOfflineEvent', schema);
