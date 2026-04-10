/**
 * MarketingCampaign — Phase 13 Global Marketing. Platform-level acquisition campaigns.
 * Channels: tiktok, youtube, instagram, influencer, affiliate.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true, maxlength: 200 },
    channel:        { type: String, enum: ['tiktok', 'youtube', 'instagram', 'influencer', 'affiliate'], required: true, index: true },
    campaignType:   { type: String, enum: ['pix_bonus', 'creator_monetization', 'business_tools', 'influencer_partnership', 'generic'], default: 'generic', index: true },
    targetRegions:  [{ type: String, trim: true, uppercase: true }],
    status:         { type: String, enum: ['draft', 'active', 'paused', 'ended'], default: 'draft', index: true },
    budgetCents:    { type: Number, default: 0 },
    spentCents:    { type: Number, default: 0 },
    dailyCapCents: { type: Number, default: 0 },
    startsAt:      { type: Date },
    endsAt:        { type: Date },
    utmSource:     { type: String, trim: true, maxlength: 100 },
    utmMedium:     { type: String, trim: true, maxlength: 100 },
    utmCampaign:   { type: String, trim: true, maxlength: 200 },
    affiliateCode: { type: String, trim: true, maxlength: 50, index: true },
    signups:       { type: Number, default: 0 },
    conversions:   { type: Number, default: 0 },
    meta:          { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ status: 1, startsAt: 1, endsAt: 1 });
schema.index({ targetRegions: 1 });
schema.index({ affiliateCode: 1 }, { sparse: true });

module.exports = mongoose.model('MarketingCampaign', schema);
