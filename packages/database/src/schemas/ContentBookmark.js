'use strict';
/**
 * ContentBookmark — save/bookmark short video or stream for later.
 * Fields: contentId (stream/video), userId, contentType (stream|short).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    contentId:   { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    contentType: { type: String, enum: ['stream', 'short'], default: 'stream' },
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ contentId: 1, userId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ContentBookmark', schema);
