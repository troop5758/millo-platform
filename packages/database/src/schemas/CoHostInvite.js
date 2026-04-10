/**
 * CoHostInvite — co-host invite (Phase 4). Creator invites user to co-host stream.
 * Fields: streamId, inviterId, inviteeId, status (pending|accepted|rejected). Timestamps.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    streamId:   { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    inviterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    inviteeId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status:     { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ streamId: 1, inviteeId: 1 });
schema.index({ streamId: 1, status: 1 });

module.exports = mongoose.model('CoHostInvite', schema);
