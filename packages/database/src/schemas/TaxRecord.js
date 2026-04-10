'use strict';
/**
 * TaxRecord — Phase 4 Tax & VAT Compliance. Stores tax calculations for global compliance.
 * Fields: user_id, creator_id, amount, currency, tax_amount, tax_region, vat_rate, net_amount, timestamp.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    creatorId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    amount:        { type: Number, required: true },           // gross amount in smallest currency unit (cents)
    currency:      { type: String, required: true, trim: true, uppercase: true },
    taxAmount:     { type: Number, required: true, default: 0 }, // tax in smallest currency unit
    taxRegion:     { type: String, required: true, trim: true, uppercase: true },
    vatRate:       { type: Number, default: 0 },              // 0–100 (e.g. 20 for 20%)
    netAmount:     { type: Number, required: true },          // amount - taxAmount
    refType:       { type: String, default: null },            // e.g. 'order', 'subscription', 'gift'
    refId:         { type: String, default: null, index: true },
    invoiceId:     { type: String, default: null, index: true },
    meta:          { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ creatorId: 1, createdAt: -1 });
schema.index({ taxRegion: 1, createdAt: -1 });

module.exports = mongoose.model('TaxRecord', schema);
