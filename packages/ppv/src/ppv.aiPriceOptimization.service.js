/**
 * AI Price Optimization Engine — dynamically adjusts PPV price based on performance.
 * Metrics: conversion rate, subscriber count, creator tier, region.
 * Only applies when aiPriceEnabled is true. Shadow mode by default.
 * https://milloapp.com
 */
const db = require('@millo/database');

const AI_OPTIMIZATION_ENABLED = process.env.PPV_AI_PRICE_ENABLED === 'true';

function isEnabled() {
  return AI_OPTIMIZATION_ENABLED;
}

async function getAnalyticsForContent(contentId) {
  const [purchases, messages, contentRows] = await Promise.all([
    db.PpvContentPurchase.countDocuments({ contentId }),
    db.PpvMassMessage.findOne({ contentId }).select('recipients').lean(),
    db.PpvContentAnalytics?.find?.({ contentId }).lean().catch(() => []),
  ]);
  if (contentRows && contentRows.length > 0) {
    const contentAnalytics = contentRows.reduce(
      (acc, r) => {
        acc.views += r.views || 0;
        acc.clicks += r.clicks || 0;
        acc.purchases += r.purchases || 0;
        return acc;
      },
      { views: 0, clicks: 0, purchases: 0 }
    );
    const views = contentAnalytics.views || 0;
    const purchasesCount = contentAnalytics.purchases || purchases;
    const conversionRate = views > 0 ? purchasesCount / views : 0;
    return { views, clicks: contentAnalytics.clicks, purchasesCount, conversionRate };
  }
  const recipientsCount = messages?.recipients?.length ?? 0;
  const views = Math.max(recipientsCount, purchases);
  const conversionRate = views > 0 ? purchases / views : 0;
  return { views, clicks: 0, purchasesCount: purchases, conversionRate };
}

async function getAnalyticsForStream(streamId) {
  const [analytics, purchases] = await Promise.all([
    db.PpvAnalytics.find({ streamId }).lean(),
    db.PpvPurchase.countDocuments({ streamId }),
  ]);
  const views = analytics.reduce((s, a) => s + (a.uniqueViewers || 0), 0);
  const conversionRate = views > 0 ? purchases / views : 0;
  return { views, purchasesCount: purchases, conversionRate };
}

async function getCreatorMetrics(creatorId) {
  const [subCount, user] = await Promise.all([
    db.Subscription.countDocuments({ creatorId, status: 'active' }),
    db.User.findById(creatorId).select('creatorStatus role').lean(),
  ]);
  let tier = 1;
  if (user?.creatorStatus === 'approved') tier = 2;
  if (subCount > 1000) tier = 3;
  if (subCount > 10000) tier = 4;
  if (subCount > 50000) tier = 5;
  return { subscriberCount: subCount, creatorTier: tier };
}

/**
 * Dynamic Pricing Engine — adjusts price based on performance.
 * conversion_rate > 0.2 → +15%; conversion_rate < 0.05 → -10%; subscriber_count > 10000 → +20%.
 */
function adjustPrice(basePrice, analytics) {
  let price = typeof basePrice === 'number' ? basePrice : (basePrice?.basePriceCents ?? basePrice?.priceCents ?? 0) / 100;
  const conversionRate = analytics?.conversion_rate ?? analytics?.conversionRate ?? 0;
  const subscriberCount = analytics?.subscriber_count ?? analytics?.subscriberCount ?? 0;

  if (conversionRate > 0.2) price *= 1.15;
  if (conversionRate < 0.05) price *= 0.9;
  if (subscriberCount > 10000) price *= 1.2;

  return Math.round(price * 100) / 100;
}

/** Same as adjustPrice but returns cents. */
function adjustPriceCents(basePriceCents, analytics) {
  const adjusted = adjustPrice(basePriceCents / 100, analytics);
  return Math.round(adjusted * 100);
}

function optimizePPVPrice(basePriceCents, analytics, creatorMetrics, region) {
  let price = basePriceCents / 100;
  const { conversionRate } = analytics || {};
  const { subscriberCount = 0, creatorTier = 1 } = creatorMetrics || {};

  if (conversionRate > 0.15) price = price * 1.1;
  if (conversionRate < 0.05 && conversionRate > 0) price = price * 0.9;

  if (subscriberCount > 10000) price = price * 1.2;
  else if (subscriberCount > 50000) price = price * 1.3;

  if (creatorTier >= 4) price = price * 1.1;
  if (creatorTier >= 5) price = price * 1.15;

  const regionMultipliers = { US: 1, GB: 1.05, EU: 1.02, IN: 0.6, BR: 0.7 };
  const regionCode = (region || 'US').toUpperCase().slice(0, 2);
  const regionMult = regionMultipliers[regionCode] ?? 1;
  price = price * regionMult;

  return Math.round(price * 100);
}

async function getOptimizedPrice(ppv, context) {
  const { contentId, streamId, region } = context || {};
  const baseCents = ppv.basePriceCents ?? (ppv.base_price_usd ? Math.round(ppv.base_price_usd * 100) : null) ?? ppv.priceCents ?? 0;
  if (baseCents <= 0) return baseCents;

  if (!ppv.aiPriceEnabled && !ppv.ai_price_enabled) return baseCents;
  if (!isEnabled()) return baseCents;

  const creatorId = ppv.creatorId ?? ppv.creator_id;
  if (!creatorId) return baseCents;

  let analytics = { conversionRate: 0 };
  if (contentId) {
    analytics = await getAnalyticsForContent(contentId);
  } else if (streamId) {
    analytics = await getAnalyticsForStream(streamId);
  }

  const creatorMetrics = await getCreatorMetrics(creatorId);
  const optimizedCents = optimizePPVPrice(baseCents, analytics, creatorMetrics, region);

  const minCents = 99;
  const maxCents = 99999;
  return Math.max(minCents, Math.min(maxCents, optimizedCents));
}

module.exports = {
  isEnabled,
  adjustPrice,
  adjustPriceCents,
  optimizePPVPrice,
  getOptimizedPrice,
  getAnalyticsForContent,
  getAnalyticsForStream,
  getCreatorMetrics,
};
