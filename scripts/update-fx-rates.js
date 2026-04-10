#!/usr/bin/env node
'use strict';
/**
 * Phase 2 — Update daily FX rates. Run via cron: 0 0 * * * (daily at midnight).
 * Requires: FX_PROVIDER, FX_API_KEY or OPENEXCHANGERATES_APP_ID
 * https://milloapp.com
 */
const db = require('@millo/database');
const { currencyService } = require('@millo/economy');

async function main() {
  await db.connect();
  const result = await currencyService.updateDailyFXRates();
  console.log('FX rates updated:', result);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
