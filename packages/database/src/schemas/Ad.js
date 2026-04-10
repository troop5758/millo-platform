/**
 * Ad — MongoDB schema. https://milloapp.com
 * Product surfaces: adSurface (in_feed | pre_roll_live | sponsored_creator) complements placement (feed|live|…).
 * Bidding: bidCents for auction; cpmCents used as bid proxy when bidCents is 0.
 * Fields: campaignId (ref Campaign), placement (required), status (enum draft|active|paused), meta (mixed). Timestamps.
 * Indexes: campaignId, placement+status.
 */
const mongoose = require('mongoose');

const AD_SURFACE_VALUES = ['in_feed', 'pre_roll_live', 'sponsored_creator'];

const schema = new mongoose.Schema(
  {
    campaignId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    creatorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    placement:    { type: String, enum: ['feed', 'live', 'search', 'profile', 'story'], default: 'feed', required: true },
    /** Product ad type: in-feed card, live pre-roll, or sponsored creator slot. */
    adSurface:    { type: String, enum: AD_SURFACE_VALUES, default: 'in_feed', index: true },
    format:       { type: String, enum: ['banner', 'video', 'native', 'overlay'], default: 'native' },
    status:       { type: String, enum: ['draft', 'active', 'paused'], default: 'draft', index: true },
    headline:     { type: String, default: '', maxlength: 100 },
    description:  { type: String, default: '', maxlength: 300 },
    ctaText:      { type: String, default: 'Learn More', maxlength: 40 },
    ctaUrl:       { type: String, default: '' },
    imageUrl:     { type: String, default: '' },
    videoUrl:     { type: String, default: '' },
    impressions:  { type: Number, default: 0 },
    clicks:       { type: Number, default: 0 },
    costPerClick: { type: Number, default: 0 },   // cents
    /** Max bid per impression/auction step (cents). */
    bidCents:     { type: Number, default: 0 },
    /** CPM in cents; when bidCents is 0, selection uses this as bid proxy. */
    cpmCents:     { type: Number, default: 0 },
    /** Extra targeting JSON (client-defined); use country/language/interestTags for indexed fields. */
    targeting:    { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Region codes to target (e.g. US, UK, EU). Empty = all regions. */
    target_regions: { type: [String], default: [], index: true },
    /** Regional targeting fields (per-ad) */
    country:     { type: String, default: null, index: true },          // ISO country code, e.g. "US"
    language:    { type: String, default: null, index: true },          // BCP-47 language tag, e.g. "en", "pt-BR"
    ageGroup:    { type: String, default: null, index: true },          // e.g. "18-24", "25-34"
    interestTags:{ type: [String], default: [], index: true },          // e.g. ["gaming","fitness"]
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ campaignId: 1 });
schema.index({ placement: 1, status: 1 });
schema.index({ target_regions: 1 });
schema.index({ adSurface: 1, status: 1, placement: 1 });

const AdModel = mongoose.model('Ad', schema);
AdModel.AD_SURFACE_VALUES = AD_SURFACE_VALUES;
module.exports = AdModel;
