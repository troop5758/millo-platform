#!/usr/bin/env node
'use strict';
/**
 * Compile MongoDB indexes for all `@millo/database` models (calls `syncIndexes()` on each).
 * Run after deploy when schemas/index definitions change. Requires `MONGODB_URI`.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function main() {
  await db.connect();
  await db.syncIndexes();
  console.log('syncIndexes: completed for all registered models');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
