'use strict';
/**
 * StreamLike — Phase 7 Discovery. Like on live stream.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ streamId: 1, userId: 1 }, { unique: true });
schema.index({ streamId: 1 });

module.exports = mongoose.model('StreamLike', schema);
