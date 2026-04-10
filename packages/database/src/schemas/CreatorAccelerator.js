'use strict';
/**
 * CreatorAccelerator — Phase 6 Millo Creator Accelerator.
 * Featured creators, bonus visibility, creator grants, algorithm boost.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    featured:         { type: Boolean, default: false, index: true },
    bonusVisibility:  { type: Number, default: 0 },        // 0–100 multiplier
    algorithmBoost:   { type: Number, default: 0 },        // added to ranking score
    grantCents:       { type: Number, default: 0 },        // creator grant amount
    grantStatus:      { type: String, enum: ['none', 'pending', 'awarded'], default: 'none' },
    enrolledAt:       { type: Date, default: null },
    meta:             { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1 }, { unique: true });
schema.index({ featured: 1, algorithmBoost: -1 });

module.exports = mongoose.model('CreatorAccelerator', schema);
