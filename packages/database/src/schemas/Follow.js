/**
 * Follow — MongoDB schema. Profile system: followers / following.
 * Fields: followerId (ref User), followingId (ref User). Timestamps.
 * Indexes: followerId+followingId (unique), followingId, createdAt.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    followerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    followingId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ followerId: 1, followingId: 1 }, { unique: true });
schema.index({ followingId: 1 });
schema.index({ createdAt: -1 });

module.exports = mongoose.model('Follow', schema);
