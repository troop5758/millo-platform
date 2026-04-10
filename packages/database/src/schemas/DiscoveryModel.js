'use strict';
/**
 * DiscoveryModel — filter version pinning for recommendation / discovery models.
 * Allows testing new recommendation models with a percentage rollout (e.g. v3 at 20%).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    modelId:      { type: String, required: true, trim: true, index: true }, // e.g. 'feed', 'trending'
    modelVersion: { type: String, required: true, trim: true },                // e.g. 'v3'
    rollout:      { type: Number, default: 0, min: 0, max: 100 },             // percentage 0-100
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ modelId: 1 }, { unique: true });

module.exports = mongoose.model('DiscoveryModel', schema);
