/**
 * Payment tax service — VAT/GST calculation, tax record storage.
 * Region-based rates; integrates with TaxRecord schema.
 * https://milloapp.com
 */
const db = require('@millo/database');

const REGION_VAT = {
  EU: 20, UK: 20, DE: 19, FR: 20, IT: 22, ES: 21, NL: 21,
  BR: 17, IN: 18, AU: 10, NZ: 15, CA: 5, US: 0,
};

async function calculateTax(amountCents, regionCode, opts = {}) {
  const region = (regionCode || 'US').toUpperCase();
  const vatRate = ((REGION_VAT[region] ?? REGION_VAT.EU) / 100);
  const taxCents = Math.round(amountCents * vatRate);
  return { taxCents, vatRate, netCents: amountCents - taxCents, grossCents: amountCents };
}

async function storeTaxRecord(record) {
  if (!db.TaxRecord) return null;
  return db.TaxRecord.create(record).catch(() => null);
}

module.exports = { calculateTax, storeTaxRecord };
