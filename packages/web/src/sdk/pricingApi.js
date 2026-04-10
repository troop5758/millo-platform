/**
 * Pricing SDK — wraps /pricing/* API endpoints.
 * Supports regional pricing: auto-detects user country, fetches region-adjusted
 * prices, and formats in local currency using Intl.NumberFormat.
 *
 * Exports:
 *   usePricing()           — React hook, auto-detects region, returns { config, region, loading }
 *   fetchPricingConfig()   — raw fetch (module-cached)
 *   detectCountry()        — calls /pricing/geo to get country + tier
 *   formatLocalPrice()     — Intl format with currency
 *   PRICING_DEFAULTS       — offline fallback
 *   Admin SDK functions
 * https://milloapp.com
 */
import { useState, useEffect } from 'react';
import { API_BASE } from '../config/api.js';

const BASE = API_BASE;
const COUNTRY_STORAGE_KEY = 'millo_country';

/* ── Marketing-strategy USD defaults (mirrors packages/economy/src/pricing.js) ── */
export const PRICING_DEFAULTS = {
  coinPacks: [
    { id: 'starter',  coins: 100,   bonusCoins: 0,    priceCents: 99,   label: 'Starter',  popular: false },
    { id: 'basic',    coins: 500,   bonusCoins: 50,   priceCents: 499,  label: 'Basic',    popular: false },
    { id: 'popular',  coins: 1200,  bonusCoins: 200,  priceCents: 999,  label: 'Popular',  popular: true  },
    { id: 'pro',      coins: 2500,  bonusCoins: 500,  priceCents: 1999, label: 'Pro',      popular: false },
    { id: 'mega',     coins: 6500,  bonusCoins: 1500, priceCents: 4999, label: 'Mega',     popular: false },
    { id: 'ultra',    coins: 14000, bonusCoins: 4000, priceCents: 9999, label: 'Ultra',    popular: false },
  ],
  giftCosts: {
    'rose': 1, 'ice-cream': 5, 'lollipop': 10, 'diamond': 50,
    'trophy': 99, 'crown': 199, 'rocket': 299, 'galaxy': 499,
    'dragon': 999, 'lion': 1499, 'universe': 4999, 'millo-star': 9999,
  },
  subscriptionTiers: [
    {
      id: 'free', name: 'Free', priceMonthly: 0, priceAnnual: 0, currency: 'USD',
      features: ['Watch live streams', 'Send Common & Rare gifts', 'Follow up to 500 creators', 'Basic chat'],
      highlight: false,
    },
    {
      id: 'creator', name: 'Creator', priceMonthly: 999, priceAnnual: 8990, currency: 'USD',
      features: ['Everything in Free', 'Go live (unlimited)', 'Creator storefront', 'Sell products & run auctions', 'Basic analytics dashboard', 'Send all gift tiers'],
      highlight: true, badge: 'Most Popular',
    },
    {
      id: 'pro', name: 'Pro', priceMonthly: 2499, priceAnnual: 22490, currency: 'USD',
      features: ['Everything in Creator', 'Verified badge', 'Advanced analytics & exports', 'Priority support (24 h)', 'Revenue boost (+5%)', 'Multi-stream & co-host', 'Custom domain for storefront'],
      highlight: false, badge: 'Best Value',
    },
  ],
  coinsPerDollar: 100,
  ppvMinCents: 99,
  ppvMaxCents: 9999,
};

export const DEFAULT_REGION = { country: 'US', currency: 'USD', tier: 'A', tierLabel: 'Premium', multiplier: 1.0 };

/* ── Module-level cache ── */
let _cachedConfig  = null;
let _cachedRegion  = null;
let _configPromise = null;
let _geoPromise    = null;

/**
 * Detect country from API (geo lookup). Cached for the session.
 * Falls back to localStorage cache, then DEFAULT_REGION.
 */
export async function detectCountry() {
  if (_cachedRegion) return _cachedRegion;
  if (_geoPromise)   return _geoPromise;

  _geoPromise = (async () => {
    // Try localStorage cache first (avoids extra request on revisit)
    try {
      const stored = localStorage.getItem(COUNTRY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Expire after 24 hours
        if (parsed.ts && Date.now() - parsed.ts < 86_400_000) {
          _cachedRegion = parsed;
          return parsed;
        }
      }
    } catch (_) { /* ignore */ }

    try {
      const res = await fetch(`${BASE}/pricing/geo`);
      if (!res.ok) throw new Error('GEO_FAIL');
      const data = await res.json();
      const region = { ...data, ts: Date.now() };
      _cachedRegion = region;
      try { localStorage.setItem(COUNTRY_STORAGE_KEY, JSON.stringify(region)); } catch (_) { /* ignore */ }
      return region;
    } catch {
      _cachedRegion = { ...DEFAULT_REGION, ts: Date.now() };
      return _cachedRegion;
    }
  })();

  return _geoPromise;
}

/**
 * Fetch region-adjusted pricing config for a country.
 * Country auto-detected if not provided.
 */
export async function fetchPricingConfig(countryCode) {
  const country = countryCode ?? (await detectCountry()).country ?? 'US';
  const cacheKey = country;

  if (_cachedConfig?.country === cacheKey) return _cachedConfig.data;
  if (_configPromise?.country === cacheKey) return _configPromise.promise;

  const p = (async () => {
    try {
      const res = await fetch(`${BASE}/pricing/config?country=${country}`);
      if (!res.ok) throw new Error('NOT_OK');
      const { config } = await res.json();
      const merged = { ...PRICING_DEFAULTS, ...config };
      _cachedConfig = { country: cacheKey, data: merged };
      return merged;
    } catch {
      _cachedConfig = { country: cacheKey, data: PRICING_DEFAULTS };
      return PRICING_DEFAULTS;
    }
  })();
  _configPromise = { country: cacheKey, promise: p };
  return p;
}

/** Invalidate all caches — call after admin saves new pricing. */
export function invalidatePricingCache() {
  _cachedConfig  = null;
  _cachedRegion  = null;
  _configPromise = null;
  _geoPromise    = null;
  try { localStorage.removeItem(COUNTRY_STORAGE_KEY); } catch (_) { /* ignore */ }
}

/**
 * Format a local-currency cents value as a display string.
 * Uses Intl.NumberFormat. Falls back to "$X.XX" on error.
 * @param {number} localCents — already converted/adjusted cents in local currency
 * @param {string} currency   — ISO 4217 code (e.g. "BRL", "INR")
 * @param {string} [locale]   — optional BCP47 locale tag
 */
export function formatLocalPrice(localCents, currency = 'USD', locale) {
  if (localCents === 0) return 'Free';
  const code    = currency || 'USD';
  // Currencies with 0 decimal places
  const noDecimals = ['JPY','KRW','IDR','VND','CLP','HUF','ISK','TWD','KHR','LAK','MMK','MGA','RWF','UGX','TZS','XOF','XAF','COP','NGN'];
  const decimals = noDecimals.includes(code) ? 0 : 2;
  const amount   = localCents / Math.pow(10, decimals === 0 ? 0 : 2);
  try {
    return new Intl.NumberFormat(locale || navigator.language || 'en', {
      style:    'currency',
      currency: code,
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(decimals)}`;
  }
}

/** Format USD cents as "$X.XX" (always USD, for admin displays) */
export function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format USD cents cleanly: 0 → "Free", 999 → "$9.99", 2400 → "$24" */
export function formatPrice(cents) {
  if (!cents) return 'Free';
  const d = cents / 100;
  return d % 1 === 0 ? `$${d}` : `$${d.toFixed(2)}`;
}

/* ── React hook ── */
/**
 * usePricing() — auto-detects country, fetches region-adjusted config.
 * Returns { config, region, loading, country }.
 * config.coinPacks and config.subscriptionTiers have `localPriceCents`,
 * `localCurrency`, and `localFormatted` fields for display.
 */
export function usePricing() {
  const [config,  setConfig]  = useState(PRICING_DEFAULTS);
  const [region,  setRegion]  = useState(DEFAULT_REGION);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const geo = await detectCountry();
      if (cancelled) return;
      setRegion(geo);
      const cfg = await fetchPricingConfig(geo.country);
      if (cancelled) return;
      setConfig(cfg);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  return { config, region, loading, country: region.country };
}

/* ── Admin SDK ── */
async function adminHeaders() {
  const raw  = localStorage.getItem('millo_user');
  const user = raw ? JSON.parse(raw) : {};
  return {
    'Content-Type': 'application/json',
    'X-User-Id':    user.id   ?? '',
    'X-User-Role':  user.role ?? '',
  };
}

export async function adminGetPricingConfig() {
  const res = await fetch(`${BASE}/pricing/admin/config`, { headers: await adminHeaders() });
  return res.json();
}

export async function adminSavePricingConfig(patch) {
  const res = await fetch(`${BASE}/pricing/admin/config`, {
    method:  'POST',
    headers: await adminHeaders(),
    body:    JSON.stringify(patch),
  });
  invalidatePricingCache();
  return res.json();
}

export async function adminResetPricingField(field) {
  const res = await fetch(`${BASE}/pricing/admin/config/reset`, {
    method:  'POST',
    headers: await adminHeaders(),
    body:    JSON.stringify({ field }),
  });
  invalidatePricingCache();
  return res.json();
}

export async function adminGetRegions() {
  const res = await fetch(`${BASE}/pricing/admin/regions`, { headers: await adminHeaders() });
  return res.json();
}

export async function adminSaveRegions(patch) {
  const res = await fetch(`${BASE}/pricing/admin/regions`, {
    method:  'POST',
    headers: await adminHeaders(),
    body:    JSON.stringify(patch),
  });
  invalidatePricingCache();
  return res.json();
}
