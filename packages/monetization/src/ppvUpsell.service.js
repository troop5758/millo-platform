/**
 * PPV Upsell Service — suggest upsells after unlock, bundle, mass message.
 * https://milloapp.com
 */
const db = require('@millo/database');
const ppv = require('@millo/ppv');

async function getUpsellsAfterUnlock(userId, contentId) {
  const content = await db.PpvContent.findById(contentId).select('creatorId').lean();
  if (!content) return [];
  const bundles = await db.PpvBundle.find({ creatorId: content.creatorId, status: 'active' })
    .sort({ priceCents: 1 })
    .limit(5)
    .lean();
  return bundles.map((b) => ({
    type: 'bundle',
    id: b._id,
    title: b.title,
    priceCents: b.priceCents,
  }));
}

async function getUpsellsAfterBundle(userId, bundleId) {
  const bundle = await db.PpvBundle.findById(bundleId).select('creatorId').lean();
  if (!bundle) return [];
  const content = await db.PpvContent.find({ creatorId: bundle.creatorId, status: 'active' })
    .sort({ priceCents: -1 })
    .limit(5)
    .lean();
  return content.map((c) => ({
    type: 'content',
    id: c._id,
    title: c.title,
    priceCents: c.priceCents,
  }));
}

async function recordUpsellImpression(userId, funnelId, stepIndex, meta = {}) {
  const funnel = require('./funnel.service');
  return funnel.recordFunnelStep(userId, funnelId, stepIndex, { ...meta, source: 'ppv_upsell' });
}

module.exports = {
  getUpsellsAfterUnlock,
  getUpsellsAfterBundle,
  recordUpsellImpression,
};
