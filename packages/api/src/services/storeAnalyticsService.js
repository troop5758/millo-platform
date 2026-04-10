'use strict';
/**
 * Store analytics — record views, clicks, orders; aggregate for creator dashboard.
 * Metrics: Store Views, Product Clicks, Conversion Rate, Top Products, Revenue.
 * https://milloapp.com
 */
const mongoose = require('mongoose');
const db = require('@millo/database');

function startOfDay(d) {
  const date = new Date(d);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/**
 * Record a store view (storefront page load). Call from public endpoint.
 */
async function recordStoreView(creatorId) {
  const date = startOfDay(new Date());
  await db.StoreAnalytics.findOneAndUpdate(
    { creatorId, date },
    { $inc: { storeViews: 1 } },
    { upsert: true }
  );
}

/**
 * Record a product click on the store. productId must belong to creatorId.
 */
async function recordProductClick(creatorId, productId) {
  const date = startOfDay(new Date());
  await db.StoreAnalytics.findOneAndUpdate(
    { creatorId, date },
    { $inc: { productClicks: 1 } },
    { upsert: true }
  );
}

/**
 * Record a completed order: increment orderCount and revenueCents per creator in the order.
 * Call after Order is created (e.g. from createOrderFromItems).
 * @param {object} order - Order doc with items[] (creatorId, productId, name, qty, priceCents)
 */
async function recordOrderForStoreAnalytics(order) {
  if (!order?.items?.length) return;
  const orderDate = startOfDay(order.createdAt || new Date());
  const byCreator = {};
  for (const item of order.items) {
    const cid = String(item.creatorId);
    if (!byCreator[cid]) byCreator[cid] = { orderCount: 0, revenueCents: 0 };
    byCreator[cid].orderCount = 1; // one order counts once per creator
    byCreator[cid].revenueCents += (item.priceCents || 0) * (item.qty || 1);
  }
  for (const [creatorId, data] of Object.entries(byCreator)) {
    await db.StoreAnalytics.findOneAndUpdate(
      { creatorId, date: orderDate },
      { $inc: { orderCount: data.orderCount, revenueCents: data.revenueCents } },
      { upsert: true }
    );
  }
}

/**
 * Get store analytics for creator dashboard.
 * @param {string} creatorId - creator ObjectId
 * @param {Date} startDate - start of range (inclusive day)
 * @param {Date} endDate - end of range (inclusive day)
 * @returns {Promise<{ storeViews, productClicks, orderCount, revenueCents, conversionRate, topProducts }>}
 */
async function getStoreAnalytics(creatorId, startDate, endDate) {
  const start = startOfDay(startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const end = startOfDay(endDate || new Date());
  if (end < start) return getEmptyResult();

  const rows = await db.StoreAnalytics.find({
    creatorId,
    date: { $gte: start, $lte: end },
  })
    .sort({ date: 1 })
    .lean();

  let storeViews = 0;
  let productClicks = 0;
  let orderCount = 0;
  let revenueCents = 0;
  for (const r of rows) {
    storeViews += r.storeViews || 0;
    productClicks += r.productClicks || 0;
    orderCount += r.orderCount || 0;
    revenueCents += r.revenueCents || 0;
  }

  const conversionRate = storeViews > 0 ? Math.round((orderCount / storeViews) * 10000) / 100 : 0;

  // Top products: from Order items for this creator in date range (paid orders)
  const topProducts = await db.Order.aggregate([
    { $match: { status: 'paid', 'items.creatorId': new mongoose.Types.ObjectId(creatorId), createdAt: { $gte: start, $lte: new Date(end.getTime() + 24 * 60 * 60 * 1000 - 1) } } },
    { $unwind: '$items' },
    { $match: { 'items.creatorId': new mongoose.Types.ObjectId(creatorId) } },
    { $group: { _id: '$items.productId', name: { $first: '$items.name' }, quantitySold: { $sum: '$items.qty' }, revenueCents: { $sum: { $multiply: ['$items.priceCents', '$items.qty'] } } } },
    { $sort: { revenueCents: -1 } },
    { $limit: 20 },
    { $project: { productId: '$_id', name: 1, quantitySold: 1, revenueCents: 1, _id: 0 } },
  ]);

  return {
    storeViews,
    productClicks,
    orderCount,
    revenueCents,
    conversionRate,
    topProducts: topProducts.map((p) => ({
      productId: String(p.productId),
      name: p.name,
      quantitySold: p.quantitySold,
      revenueCents: p.revenueCents,
    })),
    startDate: start,
    endDate: end,
  };
}

function getEmptyResult() {
  return {
    storeViews: 0,
    productClicks: 0,
    orderCount: 0,
    revenueCents: 0,
    conversionRate: 0,
    topProducts: [],
    startDate: null,
    endDate: null,
  };
}

module.exports = {
  recordStoreView,
  recordProductClick,
  recordOrderForStoreAnalytics,
  getStoreAnalytics,
};
