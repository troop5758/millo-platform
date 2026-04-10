/**
 * MonetizationEvent — tracks all revenue actions for analytics and fan segmentation.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const EVENT_TYPES = [
  'subscription',
  'ppv_purchase',
  'gift',
  'shop_purchase',
  'auction_bid',
  'live_ticket',
];

const schema = new mongoose.Schema(
  {
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    creatorId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    eventType: {
      type: String,
      enum: EVENT_TYPES,
      required: true,
      index: true,
    },
    amount:     { type: Number, required: true },   // cents or coin amount
    currency:   { type: String, default: 'USD' },
    refType:    { type: String },   // e.g. PpvPurchase, Order, Subscription
    refId:      { type: String },   // related document id
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ creatorId: 1, createdAt: -1 });
schema.index({ eventType: 1, createdAt: -1 });
schema.index({ createdAt: -1 });

module.exports = mongoose.model('MonetizationEvent', schema);
module.exports.EVENT_TYPES = EVENT_TYPES;
