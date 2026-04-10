#!/usr/bin/env node
'use strict';
/**
 * Phase 12 — Store daily analytics snapshot. Run via cron (e.g. 0 1 * * * daily at 1am).
 * Requires: MongoDB, API analytics service.
 * https://milloapp.com
 */
const path = require('path');
const envPath = path.resolve(__dirname, '..', '.env');
if (require('fs').existsSync(envPath)) {
  const content = require('fs').readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '').trim();
      if (val) process.env[m[1]] = val;
    }
  }
}

const db = require('@millo/database');
const analyticsService = require(path.join(__dirname, '../packages/api/src/services/analyticsService'));

async function main() {
  await db.connect();
  const targetDate = process.argv[2] ? new Date(process.argv[2]) : new Date();
  const metrics = await analyticsService.storeDailySnapshot(targetDate);
  console.log('Analytics snapshot:', targetDate.toISOString().slice(0, 10), JSON.stringify(metrics));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
