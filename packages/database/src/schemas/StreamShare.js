'use strict';
/**
 * StreamShare — Phase 7 Discovery. Share of live stream.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    platform: { type: String, default: null },
  },
  { timestamps: true, _id: true }
);

schema.index({ streamId: 1, userId: 1 });
schema.index({ streamId: 1, createdAt: -1 });

module.exports = mongoose.model('StreamShare', schema);
