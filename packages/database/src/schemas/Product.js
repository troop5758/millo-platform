/**
 * Product — creator shopfront item. Phase 10: shipping & customs compliance.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name:        { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    priceCents:  { type: Number, required: true, min: 0 },
    currency:    { type: String, default: 'USD', uppercase: true },
    imageUrls:   [{ type: String }],
    category:       { type: String, default: 'general', index: true },
    contentCategory:{ type: String, enum: ['safe', 'mature', 'explicit'], default: 'safe', index: true },
    inventory:      { type: Number, default: -1 },   // -1 = unlimited
    sold:        { type: Number, default: 0 },
    status:      { type: String, enum: ['active', 'draft', 'archived', 'removed'], default: 'active', index: true }, // removed = admin-removed
    tags:        [{ type: String }],
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
    /* Phase 10: Global shipping & customs compliance */
    originCountry:    { type: String, trim: true, uppercase: true, maxlength: 2 },
    hsCode:           { type: String, trim: true, maxlength: 20 },
    weightKg:         { type: Number, min: 0 },
    declaredValueCents:{ type: Number, min: 0 },
    customsMode:      { type: String, enum: ['DAP', 'DDP'], default: 'DAP' },
  },
  { timestamps: true }
);

schema.index({ creatorId: 1, status: 1 });
schema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Product', schema);
