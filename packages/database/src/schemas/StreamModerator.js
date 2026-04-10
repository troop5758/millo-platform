/**
 * StreamModerator — creator-appointed moderators for their live streams.
 * A moderator (moderatorId) can perform mod actions (mute chat, disable reactions, block gifts, delete messages) on any stream owned by creatorId.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    moderatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, moderatorId: 1 }, { unique: true });
schema.index({ moderatorId: 1 });

module.exports = mongoose.model('StreamModerator', schema);
