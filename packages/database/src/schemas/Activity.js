/**
 * Activity — MongoDB schema. Profile activity feed: follows, uploads, purchases, gifts, live, engagement.
 * Fields: userId (ref User), type (enum), referenceId (optional ObjectId). Timestamps.
 * Indexes: userId+createdAt for feed queries.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['follow', 'video_upload', 'purchase', 'gift_sent', 'live_started', 'content_view', 'content_share'],
      required: true,
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', schema);
