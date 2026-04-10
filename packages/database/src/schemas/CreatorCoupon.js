'use strict';
/**
 * CreatorCoupon — creator discount codes for their store (e.g. SAULO10 → 10% off, LIMITEDDROP → $5 off).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    code:           { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
    discountType:   { type: String, enum: ['percent', 'fixed'], required: true },
    amount:         { type: Number, required: true }, // percent: 0-100; fixed: cents
    expiresAt:      { type: Date, default: null, index: true },
    maxRedemptions: { type: Number, default: null }, // null = unlimited
    redemptionCount: { type: Number, default: 0 },
    active:         { type: Boolean, default: true, index: true },
    meta:           { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

schema.index({ creatorId: 1, code: 1 }, { unique: true });
schema.index({ creatorId: 1, active: 1, expiresAt: 1 });

module.exports = mongoose.model('CreatorCoupon', schema);
