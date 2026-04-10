/**
 * Auction — time-limited bidding item. https://milloapp.com
 */
const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema(
  {
    bidderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amountCents:{ type: Number, required: true },
    displayName:{ type: String, default: 'Bidder' },
  },
  { timestamps: true, _id: true }
);

const schema = new mongoose.Schema(
  {
    creatorId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    streamId:         { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', default: null, index: true },
    productId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    title:            { type: String, required: true, trim: true, maxlength: 200 },
    description:      { type: String, default: '' },
    imageUrl:         { type: String, default: '' },
    startBidCents:    { type: Number, required: true, min: 1 },
    currentBidCents:  { type: Number, default: null },
    currentBidderId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reserveCents:     { type: Number, default: null },
    status:           { type: String, enum: ['upcoming', 'live', 'ended', 'awaiting_payment', 'reassign_bidder', 'defaulted'], default: 'upcoming', index: true },
    startsAt:         { type: Date },
    endsAt:           { type: Date, required: true, index: true },
    bids:             [bidSchema],
    winnerId:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    winningBidCents:  { type: Number, default: null },
    /** Payment deadline — when winner must pay by (24h); past deadline triggers defaulted. */
    deadline:         { type: Date, default: null, index: true },
    /** Set when winner payment is confirmed (commerce integrity / workers skip when set). */
    paidAt:           { type: Date, default: null, index: true },
    meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

schema.index({ creatorId: 1, status: 1 });
schema.index({ endsAt: 1, status: 1 });
schema.index({ status: 1, deadline: 1 });

module.exports = mongoose.model('Auction', schema);
