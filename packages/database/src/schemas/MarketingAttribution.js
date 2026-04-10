/**
 * MarketingAttribution — Phase 13. Tracks signup/conversion from marketing campaigns.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    campaignId:   { type: mongoose.Schema.Types.ObjectId, ref: 'MarketingCampaign', index: true },
    source:       { type: String, trim: true, maxlength: 100 },
    medium:       { type: String, trim: true, maxlength: 100 },
    campaign:     { type: String, trim: true, maxlength: 200 },
    affiliateCode:{ type: String, trim: true, maxlength: 50, index: true },
    convertedAt:  { type: Date, default: Date.now },
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ userId: 1 }, { unique: true });
schema.index({ campaignId: 1, convertedAt: -1 });

module.exports = mongoose.model('MarketingAttribution', schema);
