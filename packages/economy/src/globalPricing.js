'use strict';
/**
 * Phase 2 Global Pricing Engine — adapt prices to each country's purchasing power.
 * Formula: local_price = base_price_usd * region_multiplier * purchasing_power_factor + tax
 * https://milloapp.com
 */
const db = require('@millo/database');
const currencyService = require('./currencyService');

/** Region multipliers (Phase 2 spec). Country/region → multiplier. */
const REGION_MULTIPLIERS = {
  US: 1.0,
  EU: 1.05,
  UK: 1.05,
  BR: 0.45,
  IN: 0.30,
  MX: 0.50,
  AFRICA: 0.25,
  LATAM: 0.45,
  SEA: 0.50,
  DEFAULT: 1.0,
};

/** Country → region_code for multiplier lookup. */
const COUNTRY_TO_REGION = {
  US: 'US', CA: 'US', GB: 'UK', UK: 'UK',
  AT: 'EU', BE: 'EU', BG: 'EU', HR: 'EU', CY: 'EU', CZ: 'EU', DK: 'EU', EE: 'EU',
  FI: 'EU', FR: 'EU', DE: 'EU', GR: 'EU', HU: 'EU', IE: 'EU', IT: 'EU', LV: 'EU',
  LT: 'EU', LU: 'EU', MT: 'EU', NL: 'EU', PL: 'EU', PT: 'EU', RO: 'EU', SK: 'EU',
  SI: 'EU', ES: 'EU', SE: 'EU',
  BR: 'BR', IN: 'IN', MX: 'MX',
  NG: 'AFRICA', ZA: 'AFRICA', KE: 'AFRICA', EG: 'AFRICA', GH: 'AFRICA',
  AR: 'LATAM', CL: 'LATAM', CO: 'LATAM', PE: 'LATAM',
  ID: 'SEA', PH: 'SEA', VN: 'SEA', TH: 'SEA', MY: 'SEA', SG: 'SEA',
};

/**
 * Get region multiplier for country/region code.
 */
function getRegionMultiplier(regionCode) {
  const rc = (regionCode || 'US').toUpperCase();
  return REGION_MULTIPLIERS[rc] ?? REGION_MULTIPLIERS.DEFAULT;
}

/**
 * Get region code from country code.
 */
function getRegionCodeFromCountry(countryCode) {
  const cc = (countryCode || 'US').toUpperCase();
  return COUNTRY_TO_REGION[cc] || 'DEFAULT';
}

/**
 * Compute local price using Phase 2 formula (sync version, returns USD cents equivalent).
 * For currency conversion, use computeLocalPriceAsync.
 */
function computeLocalPrice(basePriceUsdCents, regionCode, options = {}) {
  const {
    purchasingPowerFactor = 1.0,
    vatRate = 0,
    taxInclusive = false,
  } = options;

  const regionMult = getRegionMultiplier(regionCode);
  let amount = basePriceUsdCents * regionMult * purchasingPowerFactor;

  if (!taxInclusive && vatRate > 0) {
    amount = amount * (1 + vatRate / 100);
  }

  return Math.round(amount);
}

/**
 * Compute local price with currency conversion. Returns { localPrice, currency }.
 */
async function computeLocalPriceAsync(basePriceUsdCents, regionCode, currency, options = {}) {
  const usdEquivalent = computeLocalPrice(basePriceUsdCents, regionCode, options);
  if ((currency || 'USD').toUpperCase() === 'USD') {
    return {
      localPrice: currencyService.roundLocalizedPrices(usdEquivalent, 'USD'),
      currency: 'USD',
    };
  }
  const localPrice = await currencyService.convertUSDToLocal(usdEquivalent, currency);
  return { localPrice, currency };
}

/**
 * Get or compute pricing for a product in a region.
 * Prefer PricingModel if exists; otherwise compute from Product.basePriceUsd + Region.
 */
async function getProductPrice(productId, regionCode, options = {}) {
  const product = await db.Product.findById(productId).lean();
  if (!product) return null;

  const basePriceUsdCents = product.priceCents ?? 0;
  const region = await db.Region.findOne({ region_code: regionCode }).lean();
  const vatRate = region?.vat_rate ?? 0;
  const taxInclusive = region?.tax_inclusive ?? false;
  const regionMult = region?.price_multiplier ?? getRegionMultiplier(regionCode);

  const pm = await db.PricingModel.findOne({ productId, regionCode }).lean();
  if (pm) {
    return {
      localPrice: pm.localPrice,
      currency: pm.currency,
      priceMultiplier: pm.priceMultiplier,
      taxIncluded: pm.taxIncluded,
    };
  }

  const usdEquivalent = computeLocalPrice(basePriceUsdCents, regionCode, {
    vatRate,
    taxInclusive,
    purchasingPowerFactor: options.purchasingPowerFactor ?? 1.0,
  });

  const currency = (region?.default_currency ?? 'USD').toUpperCase();
  const localPrice = currency === 'USD'
    ? currencyService.roundLocalizedPrices(usdEquivalent, 'USD')
    : await currencyService.convertUSDToLocal(usdEquivalent, currency);

  return {
    localPrice,
    currency,
    priceMultiplier: regionMult,
    taxIncluded: taxInclusive,
  };
}

module.exports = {
  REGION_MULTIPLIERS,
  getRegionMultiplier,
  getRegionCodeFromCountry,
  computeLocalPrice,
  computeLocalPriceAsync,
  getProductPrice,
};
