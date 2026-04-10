'use strict';
/**
 * Regional pricing — maps every country to a pricing tier, multiplier,
 * and display currency so we can adapt prices to local purchasing power.
 *
 * Marketing strategy:
 *   Tier A (Premium)  — mature markets, full price          × 1.00
 *   Tier B (Standard) — developed secondary markets         × 0.75
 *   Tier C (Emerging) — large growth markets, mid discount  × 0.50
 *   Tier D (Growth)   — high-growth low-income markets      × 0.30
 *
 * Multipliers and currencies are overridable from the admin dashboard
 * via PlatformSettings key "pricing.regions".
 * https://milloapp.com
 */

/* ── Default region tiers ── */
const DEFAULT_TIERS = {
  A: {
    id: 'A',
    label: 'Premium',
    description: 'Mature markets — full price',
    multiplier: 1.00,
    color: '#2563eb',
  },
  B: {
    id: 'B',
    label: 'Standard',
    description: 'Developed secondary markets — 25% off',
    multiplier: 0.75,
    color: '#0d9488',
  },
  C: {
    id: 'C',
    label: 'Emerging',
    description: 'High-growth emerging markets — 50% off',
    multiplier: 0.50,
    color: '#d97706',
  },
  D: {
    id: 'D',
    label: 'Growth',
    description: 'High-growth low-income markets — 70% off',
    multiplier: 0.30,
    color: '#dc2626',
  },
};

/**
 * Country → { tier, currency }
 * ISO 3166-1 alpha-2 codes.
 * Currency is the preferred display currency for that country.
 */
const COUNTRY_MAP = {
  /* ── Tier A — Premium ── */
  US: { tier: 'A', currency: 'USD' },
  CA: { tier: 'A', currency: 'CAD' },
  GB: { tier: 'A', currency: 'GBP' },
  AU: { tier: 'A', currency: 'AUD' },
  NZ: { tier: 'A', currency: 'NZD' },
  JP: { tier: 'A', currency: 'JPY' },
  SG: { tier: 'A', currency: 'SGD' },
  HK: { tier: 'A', currency: 'HKD' },
  CH: { tier: 'A', currency: 'CHF' },
  NO: { tier: 'A', currency: 'NOK' },
  SE: { tier: 'A', currency: 'SEK' },
  DK: { tier: 'A', currency: 'DKK' },
  FI: { tier: 'A', currency: 'EUR' },
  DE: { tier: 'A', currency: 'EUR' },
  FR: { tier: 'A', currency: 'EUR' },
  NL: { tier: 'A', currency: 'EUR' },
  AT: { tier: 'A', currency: 'EUR' },
  BE: { tier: 'A', currency: 'EUR' },
  IE: { tier: 'A', currency: 'EUR' },
  LU: { tier: 'A', currency: 'EUR' },
  IS: { tier: 'A', currency: 'ISK' },
  AE: { tier: 'A', currency: 'AED' },
  QA: { tier: 'A', currency: 'QAR' },
  KW: { tier: 'A', currency: 'KWD' },
  SA: { tier: 'A', currency: 'SAR' },
  IL: { tier: 'A', currency: 'ILS' },
  KR: { tier: 'A', currency: 'KRW' },
  TW: { tier: 'A', currency: 'TWD' },

  /* ── Tier B — Standard ── */
  ES: { tier: 'B', currency: 'EUR' },
  IT: { tier: 'B', currency: 'EUR' },
  PT: { tier: 'B', currency: 'EUR' },
  GR: { tier: 'B', currency: 'EUR' },
  CY: { tier: 'B', currency: 'EUR' },
  MT: { tier: 'B', currency: 'EUR' },
  SI: { tier: 'B', currency: 'EUR' },
  SK: { tier: 'B', currency: 'EUR' },
  EE: { tier: 'B', currency: 'EUR' },
  LV: { tier: 'B', currency: 'EUR' },
  LT: { tier: 'B', currency: 'EUR' },
  PL: { tier: 'B', currency: 'PLN' },
  CZ: { tier: 'B', currency: 'CZK' },
  HU: { tier: 'B', currency: 'HUF' },
  RO: { tier: 'B', currency: 'RON' },
  HR: { tier: 'B', currency: 'EUR' },
  BG: { tier: 'B', currency: 'BGN' },
  MX: { tier: 'B', currency: 'MXN' },
  CL: { tier: 'B', currency: 'CLP' },
  AR: { tier: 'B', currency: 'ARS' },
  UY: { tier: 'B', currency: 'UYU' },
  CR: { tier: 'B', currency: 'CRC' },
  PA: { tier: 'B', currency: 'PAB' },
  MY: { tier: 'B', currency: 'MYR' },
  TH: { tier: 'B', currency: 'THB' },
  ZA: { tier: 'B', currency: 'ZAR' },
  TR: { tier: 'B', currency: 'TRY' },
  RU: { tier: 'B', currency: 'RUB' },

  /* ── Tier C — Emerging ── */
  BR: { tier: 'C', currency: 'BRL' },
  CO: { tier: 'C', currency: 'COP' },
  PE: { tier: 'C', currency: 'PEN' },
  EC: { tier: 'C', currency: 'USD' },
  VE: { tier: 'C', currency: 'USD' },
  ID: { tier: 'C', currency: 'IDR' },
  PH: { tier: 'C', currency: 'PHP' },
  VN: { tier: 'C', currency: 'VND' },
  UA: { tier: 'C', currency: 'UAH' },
  KZ: { tier: 'C', currency: 'KZT' },
  EG: { tier: 'C', currency: 'EGP' },
  MA: { tier: 'C', currency: 'MAD' },
  TN: { tier: 'C', currency: 'TND' },
  NG: { tier: 'C', currency: 'NGN' },
  GH: { tier: 'C', currency: 'GHS' },
  KE: { tier: 'C', currency: 'KES' },
  TZ: { tier: 'C', currency: 'TZS' },
  UG: { tier: 'C', currency: 'UGX' },
  CI: { tier: 'C', currency: 'XOF' },
  CM: { tier: 'C', currency: 'XAF' },
  PK: { tier: 'C', currency: 'PKR' },

  /* ── Tier D — Growth ── */
  IN: { tier: 'D', currency: 'INR' },
  BD: { tier: 'D', currency: 'BDT' },
  LK: { tier: 'D', currency: 'LKR' },
  NP: { tier: 'D', currency: 'NPR' },
  MM: { tier: 'D', currency: 'MMK' },
  KH: { tier: 'D', currency: 'KHR' },
  LA: { tier: 'D', currency: 'LAK' },
  ET: { tier: 'D', currency: 'ETB' },
  MZ: { tier: 'D', currency: 'MZN' },
  ZM: { tier: 'D', currency: 'ZMW' },
  ZW: { tier: 'D', currency: 'USD' },
  MG: { tier: 'D', currency: 'MGA' },
  SN: { tier: 'D', currency: 'XOF' },
  ML: { tier: 'D', currency: 'XOF' },
  BF: { tier: 'D', currency: 'XOF' },
  RW: { tier: 'D', currency: 'RWF' },
};

/* ── Currency display config ── */
const CURRENCY_CONFIG = {
  USD: { symbol: '$',    code: 'USD', decimals: 2 },
  EUR: { symbol: '€',    code: 'EUR', decimals: 2 },
  GBP: { symbol: '£',    code: 'GBP', decimals: 2 },
  CAD: { symbol: 'CA$',  code: 'CAD', decimals: 2 },
  AUD: { symbol: 'A$',   code: 'AUD', decimals: 2 },
  NZD: { symbol: 'NZ$',  code: 'NZD', decimals: 2 },
  JPY: { symbol: '¥',    code: 'JPY', decimals: 0 },
  KRW: { symbol: '₩',    code: 'KRW', decimals: 0 },
  SGD: { symbol: 'S$',   code: 'SGD', decimals: 2 },
  HKD: { symbol: 'HK$',  code: 'HKD', decimals: 2 },
  CHF: { symbol: 'Fr',   code: 'CHF', decimals: 2 },
  NOK: { symbol: 'kr',   code: 'NOK', decimals: 2 },
  SEK: { symbol: 'kr',   code: 'SEK', decimals: 2 },
  DKK: { symbol: 'kr',   code: 'DKK', decimals: 2 },
  ISK: { symbol: 'kr',   code: 'ISK', decimals: 0 },
  AED: { symbol: 'د.إ',  code: 'AED', decimals: 2 },
  QAR: { symbol: '﷼',    code: 'QAR', decimals: 2 },
  KWD: { symbol: 'د.ك',  code: 'KWD', decimals: 3 },
  SAR: { symbol: '﷼',    code: 'SAR', decimals: 2 },
  ILS: { symbol: '₪',    code: 'ILS', decimals: 2 },
  TWD: { symbol: 'NT$',  code: 'TWD', decimals: 0 },
  PLN: { symbol: 'zł',   code: 'PLN', decimals: 2 },
  CZK: { symbol: 'Kč',   code: 'CZK', decimals: 2 },
  HUF: { symbol: 'Ft',   code: 'HUF', decimals: 0 },
  RON: { symbol: 'lei',  code: 'RON', decimals: 2 },
  BGN: { symbol: 'лв',   code: 'BGN', decimals: 2 },
  MXN: { symbol: 'MX$',  code: 'MXN', decimals: 2 },
  BRL: { symbol: 'R$',   code: 'BRL', decimals: 2 },
  ARS: { symbol: 'AR$',  code: 'ARS', decimals: 2 },
  CLP: { symbol: 'CL$',  code: 'CLP', decimals: 0 },
  COP: { symbol: 'CO$',  code: 'COP', decimals: 0 },
  PEN: { symbol: 'S/',   code: 'PEN', decimals: 2 },
  MYR: { symbol: 'RM',   code: 'MYR', decimals: 2 },
  THB: { symbol: '฿',    code: 'THB', decimals: 2 },
  IDR: { symbol: 'Rp',   code: 'IDR', decimals: 0 },
  PHP: { symbol: '₱',    code: 'PHP', decimals: 2 },
  VND: { symbol: '₫',    code: 'VND', decimals: 0 },
  ZAR: { symbol: 'R',    code: 'ZAR', decimals: 2 },
  TRY: { symbol: '₺',    code: 'TRY', decimals: 2 },
  RUB: { symbol: '₽',    code: 'RUB', decimals: 2 },
  UAH: { symbol: '₴',    code: 'UAH', decimals: 2 },
  KZT: { symbol: '₸',    code: 'KZT', decimals: 2 },
  EGP: { symbol: 'E£',   code: 'EGP', decimals: 2 },
  NGN: { symbol: '₦',    code: 'NGN', decimals: 2 },
  KES: { symbol: 'KSh',  code: 'KES', decimals: 2 },
  INR: { symbol: '₹',    code: 'INR', decimals: 2 },
  PKR: { symbol: '₨',    code: 'PKR', decimals: 2 },
  BDT: { symbol: '৳',    code: 'BDT', decimals: 2 },
};

/* ── FX rates relative to USD (approximate — admin can override) ── */
/* These are used to convert USD cents into local currency amounts. */
/* 1 USD = X local currency units */
const DEFAULT_FX = {
  USD: 1,      EUR: 0.93,  GBP: 0.79,  CAD: 1.36,  AUD: 1.53,
  NZD: 1.64,   JPY: 149,   KRW: 1335,  SGD: 1.34,  HKD: 7.82,
  CHF: 0.89,   NOK: 10.55, SEK: 10.42, DKK: 6.89,  ISK: 137,
  AED: 3.67,   QAR: 3.64,  KWD: 0.31,  SAR: 3.75,  ILS: 3.71,
  TWD: 31.8,   PLN: 3.97,  CZK: 22.7,  HUF: 355,   RON: 4.64,
  BGN: 1.82,   MXN: 17.2,  BRL: 4.97,  ARS: 870,   CLP: 900,
  COP: 3980,   PEN: 3.72,  MYR: 4.72,  THB: 35.1,  IDR: 15650,
  PHP: 56.4,   VND: 24500, ZAR: 18.7,  TRY: 32.1,  RUB: 90.5,
  UAH: 38.4,   KZT: 455,   EGP: 30.9,  NGN: 1570,  KES: 129,
  INR: 83.1,   PKR: 278,   BDT: 110,   GHS: 12.3,
  XOF: 610,    XAF: 610,   MAD: 10.0,  TND: 3.12,
};

/* ── In-memory tiers cache (overridable from DB) ── */
let _tiers = JSON.parse(JSON.stringify(DEFAULT_TIERS));
let _fx    = { ...DEFAULT_FX };

function applyRegionPatch(tiersOverride, fxOverride) {
  if (tiersOverride) {
    for (const [id, patch] of Object.entries(tiersOverride)) {
      if (_tiers[id]) Object.assign(_tiers[id], patch);
    }
  }
  if (fxOverride) Object.assign(_fx, fxOverride);
}

/** Get the region entry for a country code. Defaults to Tier A / USD. */
function getRegionForCountry(countryCode) {
  const cc = (countryCode || 'US').toUpperCase();
  const entry = COUNTRY_MAP[cc];
  if (!entry) return { ..._tiers['A'], currency: 'USD', countryCode: cc };
  return { ..._tiers[entry.tier], currency: entry.currency, countryCode: cc };
}

/** Convert USD cents → local currency amount. */
function convertCents(usdCents, currency) {
  const rate = _fx[currency] ?? _fx['USD'];
  const converted = Math.round(usdCents * rate);
  // Round to a clean "psychological price" in the local currency
  return cleanPrice(converted, currency);
}

/** Round to a psychologically friendly price point (ending in 9, 99, or 0). */
function cleanPrice(amount, currency) {
  const cfg = CURRENCY_CONFIG[currency];
  if (!cfg) return amount;

  if (cfg.decimals === 0) {
    // JPY, KRW, IDR, etc. — round to nearest 100 then subtract 1 (999, 4999…)
    const rounded = Math.round(amount / 100) * 100;
    return rounded > 0 ? rounded - 1 : 0;
  }

  // Decimal currencies — keep two decimal places, end in .99
  const dollars  = Math.round(amount / 100);
  return dollars > 0 ? dollars * 100 - 1 : 0; // 999 → "$9.99" pattern
}

/**
 * Format a local-currency amount (already converted cents) as a display string.
 * Uses Intl.NumberFormat when available, falls back to manual format.
 */
function formatLocalAmount(localCents, currency) {
  const cfg = CURRENCY_CONFIG[currency] ?? { symbol: '$', decimals: 2 };
  const amount = localCents / Math.pow(10, cfg.decimals === 0 ? 0 : 2);

  if (localCents === 0) return 'Free';

  try {
    return new Intl.NumberFormat('en', {
      style:    'currency',
      currency: cfg.code,
      maximumFractionDigits: cfg.decimals,
      minimumFractionDigits: cfg.decimals,
    }).format(typeof amount === 'number' ? amount : localCents / 100);
  } catch {
    return `${cfg.symbol}${amount.toFixed(cfg.decimals)}`;
  }
}

/** Return full tiers snapshot. */
function getTiers() { return JSON.parse(JSON.stringify(_tiers)); }

/** Return FX snapshot. */
function getFx() { return { ..._fx }; }

module.exports = {
  DEFAULT_TIERS,
  DEFAULT_FX,
  COUNTRY_MAP,
  CURRENCY_CONFIG,
  applyRegionPatch,
  getRegionForCountry,
  convertCents,
  formatLocalAmount,
  getTiers,
  getFx,
};
