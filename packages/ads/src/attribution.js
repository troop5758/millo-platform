/**
 * Attribution logs — impression + conversion attribution. https://milloapp.com
 */
const db = require('@millo/database');

async function logImpression(adId, opts = {}) {
  const { userId, anonymousId } = opts;
  await db.AdImpression.create({
    adId,
    userId: userId || undefined,
    anonymousId: anonymousId || undefined,
  });
}

async function logAttribution(adId, campaignId, opts = {}) {
  const { userId, conversionId, conversionType } = opts;
  await db.AuditLog.create({
    action: 'ad_attribution',
    actorId: userId || undefined,
    resourceType: 'Ad',
    resourceId: String(adId),
    meta: { campaignId: campaignId?.toString(), conversionId, conversionType },
  });
}

module.exports = { logImpression, logAttribution };
