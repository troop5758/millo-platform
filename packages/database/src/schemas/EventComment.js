'use strict';
/**
 * EventComment — chat message in a live event room.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    eventId:    { type: mongoose.Schema.Types.ObjectId, ref: 'LiveEvent', required: true, index: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    displayName: { type: String, default: '' },
    text:       { type: String, required: true, maxlength: 500 },
    deletedAt:  { type: Date, default: null },
    deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ eventId: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('EventComment', schema);
