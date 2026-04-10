'use strict';
/**
 * Region Detection Service — Phase 1 Global Market Segmentation.
 * Detects user_country, user_currency, user_language, user_tax_region, user_compliance_zone
 * from: IP geolocation, browser locale, user profile, payment billing country.
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');
const getRegionForCountry = economy.pricing?.regions?.getRegionForCountry
  || ((cc) => ({ currency: 'USD', multiplier: 1, countryCode: cc || 'US' }));

/** Parse Accept-Language header to preferred language code (e.g. "en-US" → "en"). */
function parseAcceptLanguage(header) {
  if (!header || typeof header !== 'string') return null;
  const first = header.split(',')[0]?.trim();
  if (!first) return null;
  const lang = first.split('-')[0]?.toLowerCase();
  return lang && lang.length >= 2 ? lang : null;
}

/** Extract country from Cloudflare / proxy headers. CF-IPCountry is set by Cloudflare. */
function getCountryFromHeaders(headers) {
  const cf = headers?.['cf-ipcountry'] || headers?.['CF-IPCountry'];
  if (cf && cf !== 'XX' && cf.length === 2) return cf.toUpperCase();
  return null;
}

/** Resolve user region from request context. */
async function resolveUserRegion(request) {
  const headers = request?.headers || {};
  const user = request?.user;
  const body = request?.body || {};
  const query = request?.query || {};

  let country = null;
  let language = null;
  let billingCountry = null;

  // 1. Payment billing country (highest priority when present)
  billingCountry = body?.shipping?.country || body?.country || query?.country;
  if (billingCountry && typeof billingCountry === 'string' && billingCountry.length >= 2) {
    country = billingCountry.slice(0, 2).toUpperCase();
  }

  // 2. User profile (if authenticated)
  if (!country && user) {
    const profile = await db.Profile.findOne({ userId: user._id }).lean();
    const metaCountry = profile?.meta?.country || profile?.meta?.preferredCountry;
    if (metaCountry) country = String(metaCountry).slice(0, 2).toUpperCase();
  }

  // 3. IP geolocation (proxy headers)
  if (!country) {
    country = getCountryFromHeaders(headers);
  }

  // 4. Fallback to US
  country = country || 'US';

  // Language: Accept-Language header
  language = parseAcceptLanguage(headers['accept-language']) || 'en';

  const regionInfo = getRegionForCountry(country);
  return {
    user_country: country,
    user_currency: regionInfo.currency || 'USD',
    user_language: language,
    user_tax_region: country,
    user_compliance_zone: getComplianceZone(country),
    ...regionInfo,
  };
}

/** Map country to compliance zone (GDPR, CCPA, etc.). */
function getComplianceZone(countryCode) {
  const cc = (countryCode || '').toUpperCase();
  const eu = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];
  if (eu.includes(cc)) return 'EU';
  if (cc === 'GB') return 'UK';
  if (cc === 'US') return 'US';
  if (['BR','AR','CL','CO','MX','PE'].includes(cc)) return 'LATAM';
  if (['IN','PK','BD','LK'].includes(cc)) return 'SA';
  if (['NG','ZA','KE','EG','GH'].includes(cc)) return 'AFRICA';
  if (['ID','PH','VN','TH','MY','SG'].includes(cc)) return 'SEA';
  return 'DEFAULT';
}

/** Resolve currency for display. */
function resolveCurrency(region) {
  return region?.user_currency || region?.currency || 'USD';
}

/** Resolve VAT rate for region (from Region table or default). */
async function resolveVAT(region, RegionModel) {
  if (!RegionModel) return 0;
  const zone = region?.user_compliance_zone || region?.user_country;
  const r = await RegionModel.findOne({ region_code: zone }).lean();
  return r?.vat_rate ?? 0;
}

/** Resolve legal rules for region. */
async function resolveLegalRules(region, RegionModel) {
  if (!RegionModel) {
    return {
      adult_content_allowed: true,
      age_verification_required: false,
      data_privacy_law: 'DEFAULT',
    };
  }
  const zone = region?.user_compliance_zone || region?.user_country;
  const r = await RegionModel.findOne({ region_code: zone }).lean();
  return {
    adult_content_allowed: r?.adult_content_allowed ?? true,
    age_verification_required: r?.age_verification_required ?? false,
    data_privacy_law: r?.data_privacy_law ?? 'DEFAULT',
  };
}

/** Resolve pricing multiplier (from Region table or economy tiers). */
function resolvePricingMultiplier(region) {
  return region?.multiplier ?? 1;
}

module.exports = {
  resolveUserRegion,
  resolveCurrency,
  resolveVAT,
  resolveLegalRules,
  resolvePricingMultiplier,
  getComplianceZone,
  parseAcceptLanguage,
  getCountryFromHeaders,
};
