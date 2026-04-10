/**
 * Dashboard — MongoDB schema. https://milloapp.com
 * Fields: userId (ref User, required), name (required), layout (mixed), meta (mixed). Timestamps.
 * Indexes: userId+createdAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    layout: { type: mongoose.Schema.Types.Mixed, default: {} },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Dashboard', schema);
