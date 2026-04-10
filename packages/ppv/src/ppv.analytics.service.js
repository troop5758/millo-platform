/**
 * PPV Analytics Service — aggregate views, clicks, revenue, conversions.
 * Powers: pricing AI, discovery ranking, creator dashboards.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function recordContentView(contentId, creatorId) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  await db.PpvContentAnalytics.findOneAndUpdate(
    { contentId, date },
    { $setOnInsert: { creatorId }, $inc: { views: 1 } },
    { upsert: true, new: true }
  );
}

async function recordContentClick(contentId, creatorId) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  await db.PpvContentAnalytics.findOneAndUpdate(
    { contentId, date },
    { $setOnInsert: { creatorId }, $inc: { clicks: 1 } },
    { upsert: true, new: true }
  );
}

async function recordContentPurchase(contentId, creatorId, amountCents) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const doc = await db.PpvContentAnalytics.findOneAndUpdate(
    { contentId, date },
    { $setOnInsert: { creatorId }, $inc: { purchases: 1, revenueCents: amountCents } },
    { upsert: true, new: true }
  );
  const views = doc.views || 0;
  const purchases = doc.purchases || 0;
  const conversionRate = views > 0 ? Math.round((purchases / views) * 10000) / 100 : 0;
  await db.PpvContentAnalytics.updateOne(
    { _id: doc._id },
    { $set: { conversionRate } }
  );
}

/**
 * Track PPV purchase — analytics tracking service.
 * Resolves creator from content; amount in cents.
 */
async function trackPPVPurchase(contentId, amount) {
  const content = await db.PpvContent.findById(contentId).select('creatorId').lean();
  if (!content) throw new Error('CONTENT_NOT_FOUND');
  const amountCents = typeof amount === 'number' ? Math.round(amount) : 0;
  await recordContentPurchase(contentId, content.creatorId, amountCents);
}

async function recordPurchase(streamId, creatorId, amountCents) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  await db.PpvAnalytics.findOneAndUpdate(
    { streamId, date },
    { $setOnInsert: { creatorId }, $inc: { purchaseCount: 1, revenueCents: amountCents } },
    { upsert: true, new: true }
  );
}

async function recordViewer(streamId, creatorId, peakViewers) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  await db.PpvAnalytics.findOneAndUpdate(
    { streamId, date },
    { $setOnInsert: { creatorId }, $inc: { uniqueViewers: 1 }, $max: { peakViewers } },
    { upsert: true, new: true }
  );
}

async function getStreamAnalytics(streamId, startDate, endDate) {
  const filter = { streamId };
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }
  const rows = await db.PpvAnalytics.find(filter).sort({ date: 1 }).lean();
  const summary = rows.reduce(
    (acc, r) => {
      acc.purchaseCount += r.purchaseCount || 0;
      acc.revenueCents += r.revenueCents || 0;
      acc.uniqueViewers = Math.max(acc.uniqueViewers, r.uniqueViewers || 0);
      acc.peakViewers = Math.max(acc.peakViewers, r.peakViewers || 0);
      return acc;
    },
    { purchaseCount: 0, revenueCents: 0, uniqueViewers: 0, peakViewers: 0 }
  );
  return { rows, summary };
}

async function getCreatorPpvAnalytics(creatorId, startDate, endDate) {
  const filter = { creatorId };
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }
  const rows = await db.PpvAnalytics.find(filter).sort({ date: -1 }).limit(90).lean();
  const summary = rows.reduce(
    (acc, r) => {
      acc.purchaseCount += r.purchaseCount || 0;
      acc.revenueCents += r.revenueCents || 0;
      return acc;
    },
    { purchaseCount: 0, revenueCents: 0 }
  );
  return { rows, summary };
}

async function getContentAnalytics(contentId, startDate, endDate) {
  const filter = { contentId };
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }
  const rows = await db.PpvContentAnalytics.find(filter).sort({ date: 1 }).lean();
  const summary = rows.reduce(
    (acc, r) => {
      acc.views += r.views || 0;
      acc.clicks += r.clicks || 0;
      acc.purchases += r.purchases || 0;
      acc.revenueCents += r.revenueCents || 0;
      acc.conversionRate = acc.views > 0 ? (acc.purchases / acc.views) * 100 : 0;
      return acc;
    },
    { views: 0, clicks: 0, purchases: 0, revenueCents: 0, conversionRate: 0 }
  );
  if (summary.views > 0) {
    summary.conversionRate = Math.round((summary.purchases / summary.views) * 10000) / 100;
  }
  return { rows, summary };
}

async function getCreatorContentAnalytics(creatorId, startDate, endDate) {
  const filter = { creatorId };
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }
  const rows = await db.PpvContentAnalytics.find(filter).sort({ date: -1 }).limit(90).lean();
  const summary = rows.reduce(
    (acc, r) => {
      acc.views += r.views || 0;
      acc.clicks += r.clicks || 0;
      acc.purchases += r.purchases || 0;
      acc.revenueCents += r.revenueCents || 0;
      return acc;
    },
    { views: 0, clicks: 0, purchases: 0, revenueCents: 0 }
  );
  summary.conversionRate = summary.views > 0
    ? Math.round((summary.purchases / summary.views) * 10000) / 100
    : 0;
  return { rows, summary };
}

module.exports = {
  recordPurchase,
  recordViewer,
  recordContentView,
  recordContentClick,
  recordContentPurchase,
  trackPPVPurchase,
  getStreamAnalytics,
  getContentAnalytics,
  getCreatorPpvAnalytics,
  getCreatorContentAnalytics,
};
