'use strict';
/**
 * PlatformSettings — key/value store for admin-configurable platform settings.
 * Keys are unique strings (e.g. "branding.logoUrl", "notifications.emailEnabled").
 * Values are mixed (string, number, boolean, object).
 *
 * Known keys: ai_shadow_mode (Boolean); admin_ai_controls (Object); millo_feature_toggles (Object: ads, milla, filters).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    key:       { type: String, required: true, unique: true, trim: true },
    value:     { type: mongoose.Schema.Types.Mixed },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

schema.index({ key: 1 });

module.exports = mongoose.model('PlatformSetting', schema);
