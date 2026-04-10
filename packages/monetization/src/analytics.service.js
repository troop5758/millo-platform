/**
 * Creator Revenue Analytics — unified revenue dashboard.
 * Aggregates PPV, subscriptions, gifts, storefront. https://milloapp.com
 */
const db = require('@millo/database');
const ppv = require('@millo/ppv');

/**
 * Calculate creator revenue from MonetizationEvent. Sums all event amounts where creatorId matches.
 * Note: gift amounts are in coins; use convertCoinsToCents for USD payout. Other events use cents.
 */
async function calculateCreatorRevenue(creatorId, opts = {}) {
  const { startDate, endDate } = opts;
  const query = { creatorId };
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  const events = await db.MonetizationEvent.find(query).lean();
  let revenue = 0;
  const coinConversion = require('./coinConversion.service');
  for (const e of events) {
    if (e.currency === 'coins') {
      revenue += coinConversion.convertCoinsToCents?.(e.amount) ?? 0;
    } else {
      revenue += e.amount ?? 0;
    }
  }
  return revenue;
}

async function getCreatorRevenue(creatorId, startDate, endDate) {
  const match = { actorId: creatorId, type: 'credit' };
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  const [ledgerTotal, ppvStreams, ppvContent] = await Promise.all([
    db.LedgerEntry.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amountCents' } } },
    ]).then((r) => r[0]?.total ?? 0),
    ppv.analyticsService?.getCreatorPpvAnalytics?.(creatorId, startDate, endDate) ?? { summary: { revenueCents: 0, purchaseCount: 0 } },
    ppv.analyticsService?.getCreatorContentAnalytics?.(creatorId, startDate, endDate) ?? { summary: { revenueCents: 0, purchases: 0 } },
  ]);
  const ppvRevenue = (ppvStreams?.summary?.revenueCents ?? 0) + (ppvContent?.summary?.revenueCents ?? 0);
  const ppvPurchases = (ppvStreams?.summary?.purchaseCount ?? 0) + (ppvContent?.summary?.purchases ?? 0);
  return {
    totalRevenueCents: ledgerTotal,
    ppvRevenueCents: ppvRevenue,
    ppvPurchaseCount: ppvPurchases,
    conversionRate: ppvContent?.summary?.conversionRate ?? null,
  };
}

async function getRevenueBreakdown(creatorId, startDate, endDate) {
  const match = { actorId: creatorId, type: 'credit' };
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }
  const byRefType = await db.LedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: '$refType', total: { $sum: '$amountCents' }, count: { $sum: 1 } } },
  ]);
  return byRefType.reduce((acc, r) => {
    acc[r._id || 'other'] = { totalCents: r.total, count: r.count };
    return acc;
  }, {});
}

module.exports = {
  calculateCreatorRevenue,
  getCreatorRevenue,
  getRevenueBreakdown,
};
