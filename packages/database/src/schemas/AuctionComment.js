'use strict';
/**
 * AuctionComment — chat message during a live auction.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    auctionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true, index: true },
    userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    displayName: { type: String, default: '' },
    text:        { type: String, required: true, maxlength: 500 },
    deletedAt:   { type: Date, default: null },
    deletedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ auctionId: 1, createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AuctionComment', schema);
