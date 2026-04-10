'use strict';
/**
 * CreatorBadge — badge definitions for creator trust/verification display.
 * Platform-defined badges (verified, trusted, etc.) shown on creator profiles.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    badgeId:   { type: String, required: true, unique: true, index: true },
    label:     { type: String, required: true },
    icon:      { type: String, default: 'check' },
    description: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    active:    { type: Boolean, default: true },
    meta:      { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ active: 1, sortOrder: 1 });

module.exports = mongoose.model('CreatorBadge', schema);
