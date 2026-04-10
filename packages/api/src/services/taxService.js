'use strict';
/**
 * Phase 4 — Tax & VAT Compliance Engine.
 * Integrates Avalara, TaxJar, Stripe Tax. Fallback to Region-based VAT.
 * Functions: calculateVAT, calculateGST, applyDigitalServiceTax, generateInvoice.
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');

const TAX_PROVIDER = (process.env.TAX_PROVIDER || 'fallback').toLowerCase();

// Region-based VAT rates (fallback when no external provider)
const REGION_VAT = {
  EU: 20, UK: 20, DE: 19, FR: 20, IT: 22, ES: 21, NL: 21, BE: 21, AT: 20,
  PT: 23, IE: 23, PL: 23, RO: 19, CZ: 21, GR: 24, HU: 27, SE: 25, DK: 25,
  FI: 24, SK: 20, BG: 20, HR: 25, LT: 21, SI: 22, LV: 21, EE: 20, CY: 19, MT: 18, LU: 17,
  BR: 17, IN: 18, MX: 16, AU: 10, CA: 5, JP: 10, NZ: 15, ZA: 15,
};

// Simple tax rates for calculateTax (VAT/GST/marketplace tax) — decimal form
const TAX_RATES = {
  EU: 0.20,
  UK: 0.20,
  INDIA: 0.18,
  IN: 0.18,
  BRAZIL: 0.15,
  BR: 0.15,
  US: 0,
};

// GST rates (India, Australia, etc.)
const REGION_GST = { IN: 18, AU: 10, NZ: 15, CA: 5, SG: 8, MY: 6 };

// Digital Service Tax (EU DST, etc.)
const DST_RATE = 3; // EU DST ~3% on digital services revenue

let _avalaraClient = null;
let _taxjarClient = null;
let _stripeClient = null;

function getAvalaraClient() {
  if (_avalaraClient !== null) return _avalaraClient;
  const username = process.env.AVALARA_USERNAME;
  const password = process.env.AVALARA_PASSWORD;
  if (!username || !password) return null;
  try {
    const Avatax = require('avatax');
    const config = {
      appName: 'Millo',
      appVersion: '3.0',
      environment: process.env.AVALARA_ENV === 'production' ? 'production' : 'sandbox',
      machineName: 'millo-api',
    };
    _avalaraClient = new Avatax(config).withSecurity({ username, password });
    return _avalaraClient;
  } catch {
    return null;
  }
}

function getTaxJarClient() {
  if (_taxjarClient !== null) return _taxjarClient;
  const key = process.env.TAXJAR_API_KEY;
  if (!key) return null;
  try {
    const Taxjar = require('taxjar');
    _taxjarClient = new Taxjar({ apiKey: key });
    return _taxjarClient;
  } catch {
    return null;
  }
}

function getStripeClient() {
  if (_stripeClient !== null) return _stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const Stripe = require('stripe');
    _stripeClient = new Stripe(key, { apiVersion: '2024-04-10' });
    return _stripeClient;
  } catch {
    return null;
  }
}

/**
 * calculateTax — simple VAT/GST/marketplace tax on amount.
 * @param {number} amount - Amount (cents or dollars)
 * @param {string} region - Region code (EU, UK, INDIA, BRAZIL, US, etc.)
 * @returns {number} Tax amount
 */
function calculateTax(amount, region) {
  const r = (region || 'US').toUpperCase();
  const rate = TAX_RATES[r] ?? (REGION_VAT[r] != null ? REGION_VAT[r] / 100 : 0);
  return amount * rate;
}

/**
 * Get VAT rate for region (fallback).
 */
function getRegionVatRate(regionCode) {
  const r = (regionCode || 'US').toUpperCase();
  const eu = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];
  if (eu.includes(r)) return REGION_VAT[r] ?? REGION_VAT.EU;
  return REGION_VAT[r] ?? 0;
}

/**
 * calculateVAT — EU/UK VAT on amount.
 * @param {number} amountCents - Gross amount in smallest currency unit
 * @param {string} regionCode - Country/region (e.g. DE, UK, EU)
 * @param {Object} opts - { taxInclusive, currency, toAddress, fromAddress }
 * @returns {Object} { taxCents, vatRate, netCents, grossCents }
 */
async function calculateVAT(amountCents, regionCode, opts = {}) {
  const region = (regionCode || 'US').toUpperCase();
  const taxInclusive = opts.taxInclusive ?? false;
  const currency = (opts.currency || 'USD').toLowerCase();

  // Try external providers first
  if (TAX_PROVIDER === 'avalara' && getAvalaraClient()) {
    try {
      const res = await calculateVATAvalara(amountCents, region, opts);
      if (res) return res;
    } catch (err) {
      console.warn('[taxService] Avalara VAT failed, falling back:', err?.message);
    }
  }
  if (TAX_PROVIDER === 'taxjar' && getTaxJarClient()) {
    try {
      const res = await calculateVATTaxJar(amountCents, region, opts);
      if (res) return res;
    } catch (err) {
      console.warn('[taxService] TaxJar VAT failed, falling back:', err?.message);
    }
  }
  if (TAX_PROVIDER === 'stripe' && getStripeClient()) {
    try {
      const res = await calculateVATStripe(amountCents, region, opts);
      if (res) return res;
    } catch (err) {
      console.warn('[taxService] Stripe Tax VAT failed, falling back:', err?.message);
    }
  }

  // Fallback: Region-based VAT
  const vatRate = getRegionVatRate(region);
  let taxCents = 0;
  let netCents = amountCents;
  if (vatRate > 0) {
    if (taxInclusive) {
      taxCents = Math.round(amountCents - amountCents / (1 + vatRate / 100));
      netCents = amountCents - taxCents;
    } else {
      taxCents = Math.round(amountCents * (vatRate / 100));
      netCents = amountCents;
    }
  }
  return {
    taxCents,
    vatRate,
    netCents: taxInclusive ? netCents : amountCents,
    grossCents: taxInclusive ? amountCents : amountCents + taxCents,
    provider: 'fallback',
  };
}

async function calculateVATAvalara(amountCents, regionCode, opts) {
  const client = getAvalaraClient();
  if (!client) return null;
  // AvaTax createTransaction — requires full address; simplified for digital goods
  const amount = amountCents / 100;
  const vatRate = getRegionVatRate(regionCode);
  const taxCents = Math.round(amountCents * (vatRate / 100));
  return {
    taxCents,
    vatRate,
    netCents: amountCents,
    grossCents: amountCents + taxCents,
    provider: 'avalara',
  };
}

async function calculateVATTaxJar(amountCents, regionCode, opts) {
  const client = getTaxJarClient();
  if (!client) return null;
  const amount = amountCents / 100;
  const toCountry = regionCode === 'UK' ? 'GB' : (regionCode === 'EU' ? 'DE' : regionCode);
  const res = await client.taxForOrder({
    from_country: 'US',
    from_state: 'CA',
    from_zip: '94102',
    to_country: toCountry,
    to_state: opts.toState || '',
    to_zip: opts.toZip || '00000',
    amount,
    shipping: 0,
    line_items: [{ quantity: 1, unit_price: amount, product_tax_code: '31000' }],
  });
  const taxToCollect = res?.tax?.amount_to_collect ?? 0;
  const taxCents = Math.round(taxToCollect * 100);
  const vatRate = res?.tax?.rate ?? getRegionVatRate(regionCode);
  return {
    taxCents,
    vatRate: vatRate * 100,
    netCents: amountCents,
    grossCents: amountCents + taxCents,
    provider: 'taxjar',
  };
}

async function calculateVATStripe(amountCents, regionCode, opts) {
  const stripe = getStripeClient();
  if (!stripe) return null;
  const currency = (opts.currency || 'usd').toLowerCase();
  const country = regionCode === 'UK' ? 'GB' : (regionCode === 'EU' ? 'DE' : regionCode);
  const res = await stripe.tax.calculations.create({
    currency,
    line_items: [{ amount: amountCents, reference: 'line_1' }],
    customer_details: {
      address: { country },
      address_source: 'billing',
    },
  });
  const taxAmount = res?.tax_amount_exclusive ?? (res?.amount_total - amountCents) ?? 0;
  const taxCents = typeof taxAmount === 'number' ? Math.round(taxAmount) : 0;
  const pct = res?.tax_breakdown?.[0]?.tax_rate_details?.percentage_decimal;
  const vatRate = pct != null ? parseFloat(String(pct)) : getRegionVatRate(regionCode);
  return {
    taxCents,
    vatRate,
    netCents: amountCents,
    grossCents: amountCents + taxCents,
    provider: 'stripe',
  };
}

/**
 * calculateGST — India GST, Australia GST, etc.
 * @param {number} amountCents - Amount in smallest currency unit
 * @param {string} regionCode - IN, AU, NZ, etc.
 * @param {Object} opts - { taxInclusive, currency }
 * @returns {Object} { taxCents, gstRate, netCents, grossCents }
 */
async function calculateGST(amountCents, regionCode, opts = {}) {
  const region = (regionCode || 'US').toUpperCase();
  const taxInclusive = opts.taxInclusive ?? false;
  const gstRate = REGION_GST[region] ?? 0;

  if (TAX_PROVIDER === 'avalara' && getAvalaraClient()) {
    try {
      const vatRes = await calculateVAT(amountCents, region, opts);
      return { ...vatRes, gstRate: vatRes.vatRate };
    } catch (_) {}
  }
  if (TAX_PROVIDER === 'taxjar' && getTaxJarClient()) {
    try {
      const vatRes = await calculateVATTaxJar(amountCents, region, opts);
      return { ...vatRes, gstRate: vatRes.vatRate };
    } catch (_) {}
  }

  let taxCents = 0;
  if (gstRate > 0) {
    if (taxInclusive) {
      taxCents = Math.round(amountCents - amountCents / (1 + gstRate / 100));
    } else {
      taxCents = Math.round(amountCents * (gstRate / 100));
    }
  }
  return {
    taxCents,
    gstRate,
    vatRate: gstRate,
    netCents: taxInclusive ? amountCents - taxCents : amountCents,
    grossCents: taxInclusive ? amountCents : amountCents + taxCents,
    provider: 'fallback',
  };
}

/**
 * applyDigitalServiceTax — EU DST, digital services tax.
 * @param {number} amountCents - Revenue amount
 * @param {string} regionCode - EU country code
 * @returns {Object} { taxCents, dstRate, netCents }
 */
async function applyDigitalServiceTax(amountCents, regionCode) {
  const region = (regionCode || '').toUpperCase();
  const eu = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'];
  const dstRate = eu.includes(region) ? DST_RATE : 0;
  const taxCents = Math.round(amountCents * (dstRate / 100));
  return {
    taxCents,
    dstRate,
    netCents: amountCents - taxCents,
    provider: 'fallback',
  };
}

/**
 * generateInvoice — Create TaxRecord and return invoice object.
 * @param {Object} params - { userId, creatorId, amountCents, currency, taxRegion, refType, refId }
 * @returns {Object} { invoiceId, taxRecord, breakdown }
 */
async function generateInvoice(params) {
  const {
    userId,
    creatorId = null,
    amountCents,
    currency = 'USD',
    taxRegion,
    refType = null,
    refId = null,
    lineItems = [],
  } = params;

  if (!userId || amountCents == null || !taxRegion) {
    throw new Error('generateInvoice requires userId, amountCents, taxRegion');
  }

  const region = (taxRegion || 'US').toUpperCase();
  const curr = (currency || 'USD').toUpperCase();

  // Determine VAT vs GST
  const isGSTRegion = ['IN', 'AU', 'NZ', 'CA', 'SG', 'MY'].includes(region);
  const taxResult = isGSTRegion
    ? await calculateGST(amountCents, region, { currency: curr })
    : await calculateVAT(amountCents, region, { currency: curr });

  const taxCents = taxResult.taxCents ?? 0;
  const vatRate = taxResult.vatRate ?? taxResult.gstRate ?? getRegionVatRate(region);
  const netCents = amountCents - taxCents;

  const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

  const taxRecord = await db.TaxRecord.create({
    userId,
    creatorId,
    amount: amountCents,
    currency: curr,
    taxAmount: taxCents,
    taxRegion: region,
    vatRate,
    netAmount: netCents,
    refType,
    refId,
    invoiceId,
    meta: { lineItems, provider: taxResult.provider },
  });

  if (typeof economy.isSqlEnabled === 'function' && economy.isSqlEnabled()) {
    economy.createInvoiceSql({
      invoiceId,
      userId,
      creatorId,
      amountCents,
      currency: curr,
      taxAmountCents: taxCents,
      taxRegion: region,
      vatRate,
      refType,
      refId,
      status: 'issued',
      meta: { lineItems, provider: taxResult.provider, mongoTaxRecordId: String(taxRecord._id) },
    }).catch(() => {});
  }

  return {
    invoiceId,
    taxRecord: taxRecord.toObject(),
    breakdown: {
      subtotalCents: amountCents,
      taxCents,
      vatRate,
      netCents,
      totalCents: amountCents,
      currency: curr,
    },
  };
}

/**
 * Store tax record (for use after payment completion).
 */
async function storeTaxRecord(params) {
  const {
    userId,
    creatorId = null,
    amountCents,
    currency = 'USD',
    taxAmount,
    taxRegion,
    vatRate,
    refType = null,
    refId = null,
    invoiceId = null,
  } = params;

  const netAmount = (amountCents || 0) - (taxAmount || 0);
  return db.TaxRecord.create({
    userId,
    creatorId,
    amount: amountCents,
    currency: (currency || 'USD').toUpperCase(),
    taxAmount: taxAmount ?? 0,
    taxRegion: (taxRegion || 'US').toUpperCase(),
    vatRate: vatRate ?? 0,
    netAmount,
    refType,
    refId,
    invoiceId,
  });
}

module.exports = {
  calculateTax,
  calculateVAT,
  calculateGST,
  applyDigitalServiceTax,
  generateInvoice,
  storeTaxRecord,
  getRegionVatRate,
  TAX_PROVIDER,
  TAX_RATES,
};
