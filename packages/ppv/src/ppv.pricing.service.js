/**
 * PPV Pricing Service — price calculation, regional pricing, tiers, AI optimization.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { pricing } = require('@millo/economy');
const aiOptimization = require('./ppv.aiPriceOptimization.service');

const DEFAULT_PPV_MIN_CENTS = 99;
const DEFAULT_PPV_MAX_CENTS = 99999;

async function getContentPrice(contentId, country) {
  const content = await db.PpvContent.findById(contentId).lean();
  if (!content) return null;
  let priceCents = content.basePriceCents || 0;
  if (content.aiPriceEnabled && aiOptimization.isEnabled()) {
    priceCents = await aiOptimization.getOptimizedPrice(content, {
      contentId,
      region: country,
    });
  } else if (priceCents > 0) {
    const regionConfig = country && pricing.getRegionConfig ? pricing.getRegionConfig(country) : null;
    const regionOverrides = content.regionOverrides || {};
    const override = regionOverrides[country] ?? regionOverrides[(country || '').toUpperCase()?.slice(0, 2)];
    if (override != null) priceCents = override;
    else if (regionConfig?.ppvMultiplier) priceCents = Math.round(priceCents * regionConfig.ppvMultiplier);
    priceCents = Math.max(DEFAULT_PPV_MIN_CENTS, Math.min(DEFAULT_PPV_MAX_CENTS, priceCents));
  }
  return { priceCents, currency: 'USD', content };
}

async function getStreamPrice(streamId, country) {
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream) return null;
  let priceCents = stream.priceCents || 0;
  if (priceCents <= 0) return { priceCents: 0, currency: 'USD', stream };
  const regionConfig = country && pricing.getRegionConfig ? pricing.getRegionConfig(country) : null;
  const multiplier = regionConfig && regionConfig.ppvMultiplier ? regionConfig.ppvMultiplier : 1;
  const adjusted = Math.round(priceCents * multiplier);
  const clamped = Math.max(DEFAULT_PPV_MIN_CENTS, Math.min(DEFAULT_PPV_MAX_CENTS, adjusted));
  return { priceCents: clamped, currency: (regionConfig && regionConfig.currency) || 'USD', stream };
}

function validatePrice(priceCents) {
  if (typeof priceCents !== 'number' || priceCents < 0) return false;
  return priceCents >= DEFAULT_PPV_MIN_CENTS && priceCents <= DEFAULT_PPV_MAX_CENTS;
}

function getPlatformFeeCents(priceCents) {
  const feePct = (pricing && pricing.platformFeePct) ? pricing.platformFeePct : 25;
  return Math.round(priceCents * (feePct / 100));
}

/** Get creator share in cents for a given price, using creator tier. */
async function getCreatorCents(creatorId, priceCents) {
  if (!pricing?.splitRevenueByCreator) return Math.round(priceCents * 0.75);
  const { creatorCents } = await pricing.splitRevenueByCreator(creatorId, priceCents);
  return creatorCents;
}

module.exports = {
  getStreamPrice,
  getContentPrice,
  validatePrice,
  getPlatformFeeCents,
  getCreatorCents,
  DEFAULT_PPV_MIN_CENTS,
  DEFAULT_PPV_MAX_CENTS,
};
