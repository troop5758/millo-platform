/**
 * CreatorTrustHistory — Creator Reputation Score (CRS) timeline for admin dashboard.
 * Tracks score changes: creatorId, score, reason, timestamp.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    score:     { type: Number, required: true, min: 0, max: 100 },
    reason:    { type: String, default: 'computed', trim: true, maxlength: 128 },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, timestamp: -1 });

module.exports = mongoose.model('CreatorTrustHistory', schema);
