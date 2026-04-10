'use strict';
/**
 * Phase 2 Currency Service — FX conversion, daily rate updates, localized rounding.
 * Supports: OpenExchangeRates, CurrencyLayer, Fixer (via env FX_PROVIDER + API key).
 * https://milloapp.com
 */
const db = require('@millo/database');
const https = require('https');

/** Currencies with no decimal subunits (JPY, KRW, etc.). */
const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'VND', 'IDR', 'CLP', 'COP', 'ISK', 'HUF', 'XOF', 'XAF'];

/**
 * Convert USD cents to local currency amount.
 * Uses CurrencyRate collection; falls back to economy regions FX if no DB rate.
 */
async function convertUSDToLocal(usdCents, currency) {
  const curr = (currency || 'USD').toUpperCase();
  if (curr === 'USD') return usdCents;

  const rateDoc = await db.CurrencyRate.findOne({ currency: curr }).lean();
  let rate = rateDoc?.rate;

  if (rate == null || rate <= 0) {
    const { getFx } = require('./regions');
    const fx = getFx?.() ?? {};
    rate = fx[curr] ?? 1;
  }

  const localAmount = usdCents * rate;
  return roundLocalizedPrices(localAmount, curr);
}

/**
 * Round to psychologically friendly price (e.g. 999, 4999, 9.99).
 */
function roundLocalizedPrices(amount, currency) {
  const curr = (currency || 'USD').toUpperCase();
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.includes(curr);

  if (isZeroDecimal) {
    const rounded = Math.round(amount / 100) * 100;
    return rounded > 0 ? rounded - 1 : 0;
  }

  const dollars = Math.round(amount / 100);
  return dollars > 0 ? dollars * 100 - 1 : 0;
}

/**
 * Fetch FX rates from configured provider and store in currency_rates.
 * Env: FX_PROVIDER (openexchangerates|currencylayer|fixer), FX_API_KEY or OPENEXCHANGERATES_APP_ID
 */
async function updateDailyFXRates() {
  const provider = (process.env.FX_PROVIDER || 'openexchangerates').toLowerCase();
  const apiKey = process.env.FX_API_KEY || process.env.OPENEXCHANGERATES_APP_ID;

  let rates = { USD: 1 };

  if (apiKey && provider === 'openexchangerates') {
    try {
      const data = await fetchOpenExchangeRates(apiKey);
      if (data?.rates) rates = data.rates;
    } catch (err) {
      console.warn('[currencyService] OpenExchangeRates fetch failed:', err.message);
    }
  }

  if (apiKey && provider === 'currencylayer') {
    try {
      const data = await fetchCurrencyLayer(apiKey);
      if (data?.quotes) {
        for (const [k, v] of Object.entries(data.quotes)) {
          const curr = k.replace('USD', '');
          if (curr) rates[curr] = v;
        }
      }
    } catch (err) {
      console.warn('[currencyService] CurrencyLayer fetch failed:', err.message);
    }
  }

  if (apiKey && provider === 'fixer') {
    try {
      const data = await fetchFixer(apiKey);
      if (data?.rates) rates = data.rates;
    } catch (err) {
      console.warn('[currencyService] Fixer fetch failed:', err.message);
    }
  }

  if (Object.keys(rates).length <= 1) {
    const { getFx } = require('./regions');
    const fx = getFx?.() ?? {};
    Object.assign(rates, fx);
  }

  const now = new Date();
  for (const [currency, rate] of Object.entries(rates)) {
    if (currency && typeof rate === 'number' && rate > 0) {
      await db.CurrencyRate.updateOne(
        { currency },
        { $set: { rate, updatedAt: now } },
        { upsert: true }
      );
    }
  }

  return { updated: Object.keys(rates).length, at: now };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    }).on('error', reject);
  });
}

function fetchOpenExchangeRates(appId) {
  const url = `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(appId)}`;
  return fetchJson(url);
}

function fetchCurrencyLayer(apiKey) {
  const url = `https://api.currencylayer.com/live?access_key=${encodeURIComponent(apiKey)}`;
  return fetchJson(url);
}

function fetchFixer(apiKey) {
  const url = `https://api.fixer.io/latest?base=USD&access_key=${encodeURIComponent(apiKey)}`;
  return fetchJson(url);
}

/**
 * Convert amount between two currencies (multi-currency pricing).
 * Uses exchangerate.host free API (no key required; 100 req/mo on free tier).
 * @param {number} amount - Amount in source currency
 * @param {string} from - Source currency code (e.g. 'USD')
 * @param {string} to - Target currency code (e.g. 'EUR')
 * @returns {Promise<number>} Converted amount
 */
async function convertCurrency(amount, from, to) {
  const f = (from || 'USD').toUpperCase();
  const t = (to || 'USD').toUpperCase();
  if (f === t) return amount;
  try {
    const url = `https://api.exchangerate.host/convert?from=${f}&to=${t}&amount=${encodeURIComponent(amount)}`;
    const data = await fetchJson(url);
    if (data?.result != null && typeof data.result === 'number') return data.result;
  } catch (err) {
    console.warn('[currencyService] convertCurrency failed:', err.message);
  }
  return amount;
}

module.exports = {
  convertUSDToLocal,
  convertCurrency,
  updateDailyFXRates,
  roundLocalizedPrices,
  ZERO_DECIMAL_CURRENCIES,
};
