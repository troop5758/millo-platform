/**
 * Notification — MongoDB schema. https://milloapp.com
 * Fields: userId (ref User, required), type (required), read (default false), payload (mixed). Timestamps.
 * Indexes: userId+createdAt, userId+read.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    read: { type: Boolean, default: false },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, read: 1 });

module.exports = mongoose.model('Notification', schema);
