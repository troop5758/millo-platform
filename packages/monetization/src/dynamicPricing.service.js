/**
 * Dynamic Pricing AI — price recommendations from engagement and conversion.
 * https://milloapp.com
 */
const db = require('@millo/database');
const ppv = require('@millo/ppv');

async function getPriceRecommendation(contentId, segment) {
  const content = await db.PpvContent.findById(contentId).select('creatorId priceCents').lean();
  if (!content) return null;
  const analytics = await (ppv.analyticsService?.getContentAnalytics?.(contentId) ?? Promise.resolve({ summary: {} }));
  const { views = 0, clicks = 0, purchases = 0, revenueCents = 0 } = analytics.summary;
  const conversionRate = views > 0 ? purchases / views : 0;
  const currentPrice = content.priceCents ?? 0;
  let suggestedCents = currentPrice;
  if (conversionRate > 0.15 && purchases >= 5) {
    suggestedCents = Math.min(Math.round(currentPrice * 1.1), 99900);
  } else if (conversionRate < 0.05 && views >= 20) {
    suggestedCents = Math.max(Math.round(currentPrice * 0.9), 99);
  }
  return {
    currentCents: currentPrice,
    suggestedCents,
    conversionRate: Math.round(conversionRate * 10000) / 100,
    views,
    purchases,
  };
}

async function getStreamPriceRecommendation(streamId, segment) {
  const stream = await db.LiveStream.findById(streamId).select('userId').lean();
  if (!stream) return null;
  const analytics = ppv.analyticsService?.getStreamAnalytics?.(streamId) ?? { summary: {} };
  const { purchaseCount = 0, revenueCents = 0 } = analytics.summary;
  const price = await ppv.pricingService?.getStreamPrice?.(streamId);
  const currentCents = price?.priceCents ?? 0;
  let suggestedCents = currentCents;
  if (purchaseCount >= 10 && revenueCents / purchaseCount >= currentCents * 0.9) {
    suggestedCents = Math.min(Math.round(currentCents * 1.05), 99900);
  }
  return {
    currentCents,
    suggestedCents,
    purchaseCount,
    revenueCents,
  };
}

module.exports = {
  getPriceRecommendation,
  getStreamPriceRecommendation,
};
