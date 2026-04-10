/**
 * DMMessage — direct message. Supports soft delete via deletedAt.
 * Fields: senderId (ref User), receiverId (ref User), body, deletedAt. Timestamps.
 * Indexes: senderId+createdAt, receiverId+createdAt, (senderId+receiverId) for conversation.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true, _id: true }
);

schema.index({ senderId: 1, createdAt: -1 });
schema.index({ receiverId: 1, createdAt: -1 });
schema.index({ senderId: 1, receiverId: 1, createdAt: -1 });

module.exports = mongoose.model('DMMessage', schema);
