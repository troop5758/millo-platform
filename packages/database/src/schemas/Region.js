'use strict';
/**
 * Region — Phase 1 Global Market Segmentation. MongoDB schema.
 * Maps region_code to localized rules: currency, VAT, legal, payment methods, pricing.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    region_code:              { type: String, required: true, unique: true, trim: true, uppercase: true },
    region_name:              { type: String, required: true, trim: true },
    default_currency:         { type: String, default: 'USD', trim: true, uppercase: true },
    vat_rate:                 { type: Number, default: 0 },           // 0–100 (e.g. 20 for 20%)
    adult_content_allowed:    { type: Boolean, default: true },
    local_payment_methods:     [{ type: String, trim: true }],         // e.g. ['card','paypal','pix']
    price_multiplier:         { type: Number, default: 1 },            // 0.3–1.0
    tax_inclusive:            { type: Boolean, default: false } ,      // prices include VAT
    age_verification_required:{ type: Boolean, default: false },
    data_privacy_law:         { type: String, default: 'DEFAULT' },    // GDPR, CCPA, DEFAULT
    meta:                     { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ region_code: 1 }, { unique: true });
schema.index({ data_privacy_law: 1 });

module.exports = mongoose.model('Region', schema);
