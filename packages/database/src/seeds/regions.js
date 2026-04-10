'use strict';
/**
 * Seed Region table with Phase 1 example rows.
 * Run: node -e "require('@millo/database').connect().then(() => require('./seeds/regions')())"
 * https://milloapp.com
 */
const db = require('@millo/database');

const SEED_REGIONS = [
  { region_code: 'US', region_name: 'United States', default_currency: 'USD', vat_rate: 0, adult_content_allowed: true, local_payment_methods: ['card', 'paypal'], price_multiplier: 1, tax_inclusive: false, age_verification_required: false, data_privacy_law: 'CCPA' },
  { region_code: 'EU', region_name: 'European Union', default_currency: 'EUR', vat_rate: 20, adult_content_allowed: true, local_payment_methods: ['card', 'paypal', 'sepa'], price_multiplier: 1, tax_inclusive: true, age_verification_required: false, data_privacy_law: 'GDPR' },
  { region_code: 'UK', region_name: 'United Kingdom', default_currency: 'GBP', vat_rate: 20, adult_content_allowed: true, local_payment_methods: ['card', 'paypal'], price_multiplier: 1, tax_inclusive: false, age_verification_required: false, data_privacy_law: 'UK_GDPR' },
  { region_code: 'BR', region_name: 'Brazil', default_currency: 'BRL', vat_rate: 17, adult_content_allowed: true, local_payment_methods: ['card', 'pix', 'boleto'], price_multiplier: 0.5, tax_inclusive: false, age_verification_required: false, data_privacy_law: 'LGPD' },
  { region_code: 'IN', region_name: 'India', default_currency: 'INR', vat_rate: 18, adult_content_allowed: true, local_payment_methods: ['card', 'upi'], price_multiplier: 0.3, tax_inclusive: false, age_verification_required: false, data_privacy_law: 'DEFAULT' },
  { region_code: 'LATAM', region_name: 'Latin America', default_currency: 'USD', vat_rate: 0, adult_content_allowed: true, local_payment_methods: ['card', 'paypal'], price_multiplier: 0.5, tax_inclusive: false, age_verification_required: false, data_privacy_law: 'DEFAULT' },
  { region_code: 'AFRICA', region_name: 'Africa', default_currency: 'USD', vat_rate: 0, adult_content_allowed: true, local_payment_methods: ['card'], price_multiplier: 0.3, tax_inclusive: false, age_verification_required: false, data_privacy_law: 'DEFAULT' },
  { region_code: 'SEA', region_name: 'Southeast Asia', default_currency: 'USD', vat_rate: 0, adult_content_allowed: true, local_payment_methods: ['card', 'paypal'], price_multiplier: 0.5, tax_inclusive: false, age_verification_required: false, data_privacy_law: 'DEFAULT' },
  { region_code: 'DEFAULT', region_name: 'Default', default_currency: 'USD', vat_rate: 0, adult_content_allowed: true, local_payment_methods: ['card', 'paypal'], price_multiplier: 1, tax_inclusive: false, age_verification_required: false, data_privacy_law: 'DEFAULT' },
];

async function seedRegions() {
  for (const r of SEED_REGIONS) {
    await db.Region.updateOne(
      { region_code: r.region_code },
      { $set: r },
      { upsert: true }
    );
  }
  console.log(`Seeded ${SEED_REGIONS.length} regions`);
}

module.exports = seedRegions;
