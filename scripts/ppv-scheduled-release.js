#!/usr/bin/env node
'use strict';
/**
 * Scheduled PPV Drops — release premium content at scheduled times.
 * Run via cron every 1 minute: * * * * * cd /path/to/millo && npm run ppv:scheduled-release
 * https://milloapp.com
 */
const path = require('path');
const fs = require('fs');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
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
const ppv = require('@millo/ppv');

async function main() {
  await db.connect();
  const result = await ppv.scheduleReleaseService.releaseScheduledPPV();
  console.log('PPV scheduled release:', JSON.stringify(result));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
