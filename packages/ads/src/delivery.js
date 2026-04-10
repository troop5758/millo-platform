/**
 * Delivery — kill-switch halts delivery. Auction + pacing + attribution.
 * https://milloapp.com
 */
const config = require('./config');
const auction = require('./auction');
const budgetPacing = require('./budgetPacing');
const attribution = require('./attribution');
const frequencyCap = require('./frequencyCap');

function optimizeWithAi(paced, context, userCountry) {
  try {
    const ai = require('@millo/ai-optimization');
    if (typeof ai.optimizeAdsCandidates === 'function') {
      return ai.optimizeAdsCandidates(paced, {
        ...context,
        userCountry,
        region: context.region,
        country: context.country,
      });
    }
  } catch {
    /* optional dep */
  }
  return paced;
}

function matchesRegion(candidate, userCountry) {
  if (!userCountry) return true;
  const regions = candidate.target_regions;
  if (Array.isArray(regions) && regions.length > 0) {
    const uc = String(userCountry).toUpperCase().trim();
    return regions.some((r) => String(r).toUpperCase().trim() === uc);
  }
  const countries = candidate.targetAudience?.countries;
  if (!countries || !Array.isArray(countries) || countries.length === 0) return true;
  const uc = String(userCountry).toUpperCase().trim();
  return countries.some((cc) => String(cc).toUpperCase().trim() === uc);
}

async function deliver(placement, candidates, context = {}) {
  if (!config.getAdsEnabled()) return null;
  const userIdOrAnonymous = context.userId || context.anonymousId;
  if (!frequencyCap.canShowByFrequency(placement, userIdOrAnonymous)) return null;
  const { dailyBudgetCents = 0, region, country } = context;
  const userCountry = region || country || context.userCountry;
  const paced = [];
  for (const c of candidates) {
    if (!matchesRegion(c, userCountry)) continue;
    const campaignId = c.campaignId || c._id;
    const can = await budgetPacing.canSpend(campaignId, dailyBudgetCents ?? c.dailyBudgetCents ?? 0);
    if (can) paced.push({ ...c, bidCents: c.bidCents ?? 0 });
  }
  const aiPaced = optimizeWithAi(paced, context, userCountry);
  const winner = auction.runAuction(aiPaced);
  if (!winner) return null;
  const adId = winner.adId || winner._id;
  const costCents = winner.costPerImpressionCents ?? winner.bidCents ?? 0;
  if (winner.campaignId && costCents > 0) await budgetPacing.recordSpend(winner.campaignId, costCents);
  await attribution.logImpression(adId, { userId: context.userId, anonymousId: context.anonymousId });
  frequencyCap.recordImpression(placement, userIdOrAnonymous);
  return { adId, campaignId: winner.campaignId, costCents };
}

module.exports = { deliver };
