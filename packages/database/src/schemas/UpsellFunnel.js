/**
 * UpsellFunnel — automatically recommends monetization opportunities.
 * Creators configure upsells triggered by events (e.g. stream_end, content_view).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const UPSELL_TYPES = ['ppv', 'subscription_upgrade', 'coin_pack', 'shop_product'];

const schema = new mongoose.Schema(
  {
    creatorId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    triggerEvent:     { type: String, required: true, index: true },
    upsellType:       {
      type: String,
      enum: UPSELL_TYPES,
      required: true,
      index: true,
    },
    targetContentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'PpvContent', index: true },
    price:            { type: Number, default: 0 },   // cents
    sortOrder:        { type: Number, default: 0 },
    isActive:         { type: Boolean, default: true, index: true },
    meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, triggerEvent: 1 });
schema.index({ creatorId: 1, isActive: 1 });

module.exports = mongoose.model('UpsellFunnel', schema);
module.exports.UPSELL_TYPES = UPSELL_TYPES;
