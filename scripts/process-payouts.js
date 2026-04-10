#!/usr/bin/env node
'use strict';
/**
 * Automated Payout Scheduler — mark pending payouts as processing.
 * Run via cron every 24 hours: 0 0 * * * (daily at midnight)
 * https://milloapp.com
 */
const path = require('path');
const db = require('@millo/database');
const paymentOrchestration = require(path.join(__dirname, '../packages/api/src/services/paymentOrchestration'));

async function main() {
  await db.connect();
  const result = await paymentOrchestration.processPayouts();
  console.log('Payouts marked as processing:', result);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
