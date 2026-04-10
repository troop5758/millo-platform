'use strict';
/**
 * Pricing engine — all platform prices in one place.
 * Defaults are marketing-strategy values; every value is overridable from
 * the admin dashboard and stored in PlatformSettings (DB-backed).
 * Call loadFromDb() once on startup to hydrate the cache.
 * Admin changes call applyPatch() to hot-apply without restart.
 * Regional pricing uses regions.js multipliers + FX rates.
 * Regional coin packs (US, IN, BR) use validateCoinPack() for region-specific amounts.
 * https://milloapp.com
 */
const regions = require('./regions');

/** Regions with custom coin pack amounts. Others fall back to US packs. */
const REGIONAL_PACK_REGIONS = ['US', 'IN', 'BR'];

/**
 * Return region-specific coin amounts for regional pack regions.
 * @param {string} region — ISO 3166-1 alpha-2 (e.g. US, IN, BR)
 * @returns {number[]} Array of coin amounts available for purchase
 */
function validateCoinPack(region) {
  const packs = {
    US: [100, 500, 1000],
    IN: [100, 300, 700],
    BR: [100, 250, 800],
  };
  const cc = (region || 'US').toUpperCase();
  return packs[cc] || packs.US;
}

/* ── Default pricing config (marketing strategy baseline) ── */
const DEFAULTS = {
  /** Coin packs available for purchase. priceCents = USD × 100. */
  coinPacks: [
    { id: 'starter',  coins: 100,   bonusCoins: 0,    priceCents: 99,   label: 'Starter',  popular: false },
    { id: 'basic',    coins: 500,   bonusCoins: 50,   priceCents: 499,  label: 'Basic',    popular: false },
    { id: 'popular',  coins: 1200,  bonusCoins: 200,  priceCents: 999,  label: 'Popular',  popular: true  },
    { id: 'pro',      coins: 2500,  bonusCoins: 500,  priceCents: 1999, label: 'Pro',      popular: false },
    { id: 'mega',     coins: 6500,  bonusCoins: 1500, priceCents: 4999, label: 'Mega',     popular: false },
    { id: 'ultra',    coins: 14000, bonusCoins: 4000, priceCents: 9999, label: 'Ultra',    popular: false },
  ],

  /** Virtual gift costs in coins (keyed by gift id). */
  giftCosts: {
    'rose':       1,
    'ice-cream':  5,
    'lollipop':   10,
    'diamond':    50,
    'trophy':     99,
    'crown':      199,
    'rocket':     299,
    'galaxy':     499,
    'dragon':     999,
    'lion':       1499,
    'universe':   4999,
    'millo-star': 9999,
  },

  /** Revenue splits — platform fee and creator share must sum to 100. */
  platformFeePct:  25,   // % platform retains (default)
  creatorSharePct: 75,   // % creator receives (default)
  /** Creator tier overrides: pro 80%, enterprise 85% */
  creatorTierShare: { standard: 75, pro: 80, enterprise: 85 },

  /** Subscription tiers. priceMonthly/priceAnnual in cents. */
  subscriptionTiers: [
    {
      id: 'free',
      name: 'Free',
      priceMonthly: 0,
      priceAnnual: 0,
      currency: 'USD',
      features: [
        'Watch live streams',
        'Send Common & Rare gifts',
        'Follow up to 500 creators',
        'Basic chat',
      ],
      highlight: false,
    },
    {
      id: 'creator',
      name: 'Creator',
      priceMonthly: 999,
      priceAnnual: 8990,
      currency: 'USD',
      features: [
        'Everything in Free',
        'Go live (unlimited)',
        'Creator storefront',
        'Sell products & run auctions',
        'Basic analytics dashboard',
        'Send all gift tiers',
      ],
      highlight: true,
      badge: 'Most Popular',
    },
    {
      id: 'pro',
      name: 'Pro',
      priceMonthly: 2499,
      priceAnnual: 22490,
      currency: 'USD',
      features: [
        'Everything in Creator',
        'Verified badge',
        'Advanced analytics & exports',
        'Priority support (24 h)',
        'Revenue boost (+5%)',
        'Multi-stream & co-host',
        'Custom domain for storefront',
      ],
      highlight: false,
      badge: 'Best Value',
    },
  ],

  /** Coin exchange rate: how many coins equal $1.00 */
  coinsPerDollar: 100,

  /** Pay-per-view price range in cents */
  ppvMinCents: 99,
  ppvMaxCents: 9999,

  /** DM monetization */
  dmCentsPerMinute: 10,
  dmFreeBufferMinutes: 5,
};

/* ── In-memory cache ── */
const _cache = JSON.parse(JSON.stringify(DEFAULTS));

/** Hydrate cache from PlatformSettings on startup. Call once after db.connect(). */
async function loadFromDb() {
  try {
    const { PlatformSettings } = require('@millo/database');
    const docs = await PlatformSettings.find({ key: { $regex: /^pricing\./ } }).lean();
    for (const doc of docs) {
      const field = doc.key.replace('pricing.', '');
      if (field === 'regions.tiers') { regions.applyRegionPatch(doc.value, null); continue; }
      if (field === 'regions.fx')    { regions.applyRegionPatch(null, doc.value); continue; }
      if (_cache[field] !== undefined) _cache[field] = doc.value;
    }
  } catch (_) {
    // DB not connected — run with defaults
  }
}

/** Apply a partial patch to cache and persist to DB. Used by admin API. */
async function applyPatch(patch, updatedBy) {
  const { PlatformSettings } = require('@millo/database');
  const ops = [];
  for (const [field, value] of Object.entries(patch)) {
    if (_cache[field] === undefined) continue; // unknown field — ignore
    _cache[field] = value;
    ops.push({
      updateOne: {
        filter: { key: `pricing.${field}` },
        update: { $set: { key: `pricing.${field}`, value, updatedBy } },
        upsert: true,
      },
    });
  }
  if (ops.length) await PlatformSettings.bulkWrite(ops);
  return { ok: true, applied: Object.keys(patch) };
}

/** Return full pricing config snapshot (safe copy). */
function getConfig() {
  return JSON.parse(JSON.stringify(_cache));
}

/** Return coin cost for a gift id. Falls back to hardcoded default. */
function getGiftCost(giftId) {
  return _cache.giftCosts[giftId] ?? DEFAULTS.giftCosts[giftId] ?? 1;
}

/** Return coin pack by id. Supports regional pack IDs (e.g. IN_300). */
function getCoinPack(packId) {
  const fromCache = _cache.coinPacks.find((p) => p.id === packId);
  if (fromCache) return fromCache;

  const regionalMatch = /^([A-Z]{2})_(\d+)$/.exec((packId || '').toUpperCase());
  if (regionalMatch) {
    const [, region, coinsStr] = regionalMatch;
    const coins = parseInt(coinsStr, 10);
    const allowed = validateCoinPack(region);
    if (allowed.includes(coins)) {
      return {
        id: packId,
        coins,
        bonusCoins: 0,
        priceCents: 0,
        label: `${coins} Coins`,
      };
    }
  }
  return null;
}

/** Total coins awarded for a coin pack purchase (base + bonus). */
function packTotalCoins(packId) {
  const pack = getCoinPack(packId);
  return pack ? pack.coins + pack.bonusCoins : 0;
}

/** Revenue split for a given gross amount. Returns { platformCents, creatorCents }. */
function splitRevenue(grossCents) {
  const platformCents = Math.floor((grossCents * _cache.platformFeePct) / 100);
  const creatorCents  = grossCents - platformCents;
  return { platformCents, creatorCents };
}

/** Get creator share % for a creator (by CreatorTier). Uses creatorTier service when available. */
async function getCreatorSharePct(creatorId, type = 'ppv') {
  if (!creatorId) return _cache.creatorSharePct ?? 75;
  try {
    const creatorTier = require('./creatorTier');
    if (type === 'shop') return creatorTier.getShopCreatorSharePct(creatorId);
    if (type === 'subscription') return creatorTier.getSubscriptionCreatorSharePct(creatorId);
    if (type === 'live') return creatorTier.getLiveCreatorSharePct(creatorId);
    return creatorTier.getPpvCreatorSharePct(creatorId);
  } catch (_) {
    return _cache.creatorSharePct ?? 75;
  }
}

/** Revenue split by creator tier. type: 'ppv'|'shop'|'subscription'|'live'. */
async function splitRevenueByCreator(creatorId, grossCents, type = 'ppv') {
  const creatorPct = await getCreatorSharePct(creatorId, type);
  const creatorCents = Math.floor((grossCents * creatorPct) / 100);
  const platformCents = grossCents - creatorCents;
  return { platformCents, creatorCents };
}

/**
 * Return a region-adjusted pricing config for a specific country.
 * All priceCents/priceMonthly/priceAnnual values are converted to local currency.
 * Coin pack and subscription prices use: USD × multiplier → converted to local currency.
 *
 * @param {string} countryCode — ISO 3166-1 alpha-2 (e.g. "BR", "IN", "GB")
 * @returns Full config object enriched with localPriceCents, localCurrency, tier info
 */
function getRegionConfig(countryCode) {
  const region   = regions.getRegionForCountry(countryCode);
  const { multiplier, currency, countryCode: cc } = region;
  const cfg = getConfig();

  const labels = ['Starter', 'Basic', 'Popular'];
  let basePacks = cfg.coinPacks;

  if (REGIONAL_PACK_REGIONS.includes(cc)) {
    const amounts = validateCoinPack(cc);
    basePacks = amounts.map((coins, i) => {
      const priceCents = Math.round(coins * 0.99);
      return {
        id:       `${cc}_${coins}`,
        coins,
        bonusCoins: 0,
        priceCents,
        label:    labels[i] || `${coins} Coins`,
        popular:  i === 2,
      };
    });
  }

  const adjustedCoinPacks = basePacks.map((pack) => {
    const adjustedUsd = Math.round(pack.priceCents * multiplier);
    const localAmount = regions.convertCents(adjustedUsd, currency);
    return {
      ...pack,
      localPriceCents: localAmount,
      localCurrency:   currency,
      localFormatted:  regions.formatLocalAmount(localAmount, currency),
    };
  });

  const adjustedTiers = cfg.subscriptionTiers.map((tier) => {
    const adjMonthly = Math.round(tier.priceMonthly * multiplier);
    const adjAnnual  = Math.round(tier.priceAnnual  * multiplier);
    const localMonthly = regions.convertCents(adjMonthly, currency);
    const localAnnual  = regions.convertCents(adjAnnual,  currency);
    return {
      ...tier,
      localPriceMonthly:  localMonthly,
      localPriceAnnual:   localAnnual,
      localCurrency:      currency,
      localFormattedMonthly: regions.formatLocalAmount(localMonthly, currency),
      localFormattedAnnual:  regions.formatLocalAmount(localAnnual,  currency),
    };
  });

  return {
    ...cfg,
    coinPacks:         adjustedCoinPacks,
    subscriptionTiers: adjustedTiers,
    region: {
      countryCode: region.countryCode,
      tier:        region.id,
      tierLabel:   region.label,
      multiplier,
      currency,
      description: region.description,
    },
  };
}

/**
 * Save region tier multipliers and FX rates to DB and apply to cache.
 * patch = { tiers: { A: { multiplier: 0.9 }, … }, fx: { EUR: 0.91, … } }
 */
async function applyRegionPatch(patch, updatedBy) {
  const { PlatformSettings } = require('@millo/database');
  const ops = [];
  if (patch.tiers) {
    regions.applyRegionPatch(patch.tiers, null);
    ops.push({ updateOne: { filter: { key: 'pricing.regions.tiers' }, update: { $set: { key: 'pricing.regions.tiers', value: patch.tiers, updatedBy } }, upsert: true } });
  }
  if (patch.fx) {
    regions.applyRegionPatch(null, patch.fx);
    ops.push({ updateOne: { filter: { key: 'pricing.regions.fx' }, update: { $set: { key: 'pricing.regions.fx', value: patch.fx, updatedBy } }, upsert: true } });
  }
  if (ops.length) await PlatformSettings.bulkWrite(ops);
  return { ok: true };
}

module.exports = {
  DEFAULTS,
  loadFromDb,
  applyPatch,
  applyRegionPatch,
  getConfig,
  getRegionConfig,
  getGiftCost,
  getCoinPack,
  packTotalCoins,
  splitRevenue,
  splitRevenueByCreator,
  getCreatorSharePct,
  validateCoinPack,
  regions,
};
