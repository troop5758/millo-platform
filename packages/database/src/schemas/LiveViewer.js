/**
 * LiveViewer — MongoDB schema. https://milloapp.com
 * Fields: streamId (ref LiveStream, required), userId (ref User), anonymousId, joinedAt, leftAt. Timestamps.
 * Indexes: streamId+userId, streamId+joinedAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    anonymousId: { type: String },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date },
    lastHeartbeatAt: { type: Date },
  },
  { timestamps: true, _id: true }
);

schema.index({ streamId: 1, userId: 1 });
schema.index({ streamId: 1, joinedAt: -1 });

module.exports = mongoose.model('LiveViewer', schema);
