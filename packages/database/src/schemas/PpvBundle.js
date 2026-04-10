/**
 * PpvBundle — bundle multiple PPV items for a single purchase.
 * Supports: streams (LiveStream), content (PpvContent). Example: 5 premium videos for $29.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title:      { type: String, default: '' },
    name:       { type: String, default: '' },
    description: { type: String, default: '' },
    contentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PpvContent' }],
    streamIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream' }],
    bundlePriceCents: { type: Number, default: 0 },
    priceCents: { type: Number, default: 0 },
    status:     { type: String, enum: ['draft', 'active', 'archived'], default: 'active', index: true },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, status: 1 });

module.exports = mongoose.model('PpvBundle', schema);
