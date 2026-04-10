'use strict';
/**
 * SubscriptionTier — creator-defined subscription tier (product).
 * Each creator can define tiers (e.g. Basic, Pro) with price and benefits.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tierId:        { type: String, required: true }, // e.g. 'basic', 'pro'
    name:          { type: String, required: true },
    priceMonthlyCents: { type: Number, required: true, min: 0 },
    priceAnnualCents:  { type: Number, default: null }, // null = 10× monthly
    currency:      { type: String, default: 'USD' },
    features:      [{ type: String }],
    badge:         { type: String, default: null }, // e.g. 'Most Popular'
    sortOrder:     { type: Number, default: 0 },
    active:        { type: Boolean, default: true },
    stripePriceIdMonthly: { type: String, default: null },
    stripePriceIdAnnual:  { type: String, default: null },
    meta:          { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, tierId: 1 }, { unique: true });
schema.index({ creatorId: 1, active: 1, sortOrder: 1 });

module.exports = mongoose.model('SubscriptionTier', schema);
