'use strict';
/**
 * Phase 13 — Global Marketing Campaigns. Platform acquisition campaigns.
 * https://milloapp.com
 */
const db = require('@millo/database');

/**
 * Get active campaigns for a region.
 */
async function getActiveCampaignsForRegion(regionCode) {
  const now = new Date();
  const campaigns = await db.MarketingCampaign.find({
    status: 'active',
    $or: [
      { targetRegions: { $size: 0 } },
      { targetRegions: (regionCode || '').toUpperCase() },
    ],
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).lean();
  return campaigns;
}

/**
 * Find campaign by utm params or affiliate code.
 */
async function findCampaignByAttribution(utmSource, utmMedium, utmCampaign, affiliateCode) {
  const now = new Date();
  const match = { status: 'active' };
  const or = [];
  if (affiliateCode) or.push({ affiliateCode: String(affiliateCode).trim() });
  if (utmSource && utmCampaign) or.push({ utmSource: utmSource.trim(), utmCampaign: utmCampaign.trim() });
  if (or.length === 0) return null;
  match.$or = or;
  match.$and = [
    { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
    { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
  ];
  return db.MarketingCampaign.findOne(match).lean();
}

/**
 * Record attribution for a new user.
 */
async function recordAttribution(userId, opts = {}) {
  const { utmSource, utmMedium, utmCampaign, affiliateCode } = opts;
  const existing = await db.MarketingAttribution.findOne({ userId }).lean();
  if (existing) return existing;

  const campaign = await findCampaignByAttribution(utmSource, utmMedium, utmCampaign, affiliateCode);
  const attr = await db.MarketingAttribution.create({
    userId,
    campaignId: campaign?._id,
    source: utmSource || opts.source,
    medium: utmMedium || opts.medium,
    campaign: utmCampaign || opts.campaign,
    affiliateCode: affiliateCode || opts.affiliateCode,
    meta: opts.meta || {},
  });

  if (campaign) {
    await db.MarketingCampaign.updateOne(
      { _id: campaign._id },
      { $inc: { signups: 1 } }
    );
  }
  return attr;
}

module.exports = {
  getActiveCampaignsForRegion,
  findCampaignByAttribution,
  recordAttribution,
};
