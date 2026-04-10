'use strict';
/**
 * StoreAnalytics — per-creator, per-day store metrics: store views, product clicks, orders, revenue.
 * Powers creator store dashboard: Views, Product Clicks, Conversion Rate, Top Products, Revenue.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date:          { type: Date, required: true, index: true }, // start of day UTC
    storeViews:    { type: Number, default: 0 },
    productClicks: { type: Number, default: 0 },
    orderCount:    { type: Number, default: 0 },
    revenueCents:  { type: Number, default: 0 },
    meta:          { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, date: 1 }, { unique: true });
schema.index({ creatorId: 1, date: -1 });

module.exports = mongoose.model('StoreAnalytics', schema);
