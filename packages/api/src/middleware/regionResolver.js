'use strict';
/**
 * Region Resolver — Phase 1 Global Market Segmentation middleware.
 * Resolves user region and attaches to request.region for:
 * checkout, pricing display, creator monetization, content discovery, advertising targeting.
 * https://milloapp.com
 */
const regionDetection = require('../services/regionDetection');
const db = require('@millo/database');

/** Paths that should have region resolved (checkout, pricing, content, ads, etc.). */
const REGION_PATHS = [
  '/payments',
  '/content',
  '/economy',
  '/ads',
  '/pricing',
  '/shop',
  '/region',
  '/compliance',
  '/marketing',
];

function shouldResolveRegion(url) {
  if (!url) return false;
  const full = typeof url === 'string' ? url : url.pathname || url.url || '';
  const path = full.split('?')[0] || '';
  return REGION_PATHS.some((p) => path.startsWith(p));
}

function createRegionResolver() {
  return async function regionResolver(request, _reply) {
    if (!shouldResolveRegion(request.url)) return;

    try {
      const region = await regionDetection.resolveUserRegion(request);
      request.region = region;

      // Enrich with Region table data (VAT, legal rules, multiplier override)
      const Region = db.Region;
      if (Region) {
        const zone = region.user_compliance_zone;
        const r = await Region.findOne({ region_code: zone }).lean();
        if (r) {
          request.region.vat_rate = r.vat_rate;
          request.region.adult_content_allowed = r.adult_content_allowed;
          request.region.age_verification_required = r.age_verification_required;
          request.region.data_privacy_law = r.data_privacy_law;
          request.region.local_payment_methods = r.local_payment_methods || [];
          request.region.tax_inclusive = r.tax_inclusive;
          if (r.price_multiplier != null) request.region.multiplier = r.price_multiplier;
        }
      }

      // Attach resolver helpers for route use
      request.resolveCurrency = () => regionDetection.resolveCurrency(request.region);
      request.resolveVAT = () => regionDetection.resolveVAT(request.region, Region);
      request.resolveLegalRules = () => regionDetection.resolveLegalRules(request.region, Region);
      request.resolvePricingMultiplier = () => regionDetection.resolvePricingMultiplier(request.region);
    } catch (err) {
      request.log?.warn?.({ err }, 'Region resolution failed — using defaults');
      request.region = {
        user_country: 'US',
        user_currency: 'USD',
        user_language: 'en',
        user_tax_region: 'US',
        user_compliance_zone: 'US',
        multiplier: 1,
        vat_rate: 0,
      };
    }
  };
}

module.exports = { createRegionResolver, shouldResolveRegion };
