'use strict';
/**
 * PricingModel — Phase 2 Global Pricing Engine. Per-product, per-region pricing.
 * local_price = base_price_usd * region_multiplier * purchasing_power_factor + tax
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    productId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true },
    basePriceUsd:     { type: Number, required: true, min: 0 },   // USD cents
    regionCode:       { type: String, required: true, trim: true, uppercase: true, index: true },
    localPrice:       { type: Number, required: true, min: 0 },   // in local currency (cents or units)
    currency:         { type: String, required: true, trim: true, uppercase: true, default: 'USD' },
    priceMultiplier:  { type: Number, required: true, default: 1 },
    taxIncluded:      { type: Boolean, default: false },
    meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ productId: 1, regionCode: 1 }, { unique: true });
schema.index({ regionCode: 1 });

module.exports = mongoose.model('PricingModel', schema, 'pricing_models');
