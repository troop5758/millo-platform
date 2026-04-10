#!/usr/bin/env node
'use strict';
/**
 * Seed Gifts — virtual gift catalog with type (2d, 3d, ai).
 * Run: node scripts/seed-gifts.js
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

const DEFAULT_GIFTS = [
  { id: 'rose', cost: 1, type: '2d', label: 'Rose' },
  { id: 'ice-cream', cost: 5, type: '2d', label: 'Ice Cream' },
  { id: 'lollipop', cost: 10, type: '2d', label: 'Lollipop' },
  { id: 'diamond', cost: 50, type: '2d', label: 'Diamond' },
  { id: 'trophy', cost: 99, type: '2d', label: 'Trophy' },
  { id: 'crown', cost: 199, type: '3d', label: 'Crown' },
  { id: 'rocket', cost: 299, type: '3d', label: 'Rocket' },
  { id: 'galaxy', cost: 499, type: '3d', label: 'Galaxy' },
  { id: 'dragon', cost: 999, type: '3d', label: 'Dragon' },
  { id: 'lion', cost: 1499, type: '3d', label: 'Lion' },
  { id: 'universe', cost: 4999, type: 'ai', label: 'Universe' },
  { id: 'millo-star', cost: 9999, type: 'ai', label: 'Millo Star' },
];

async function main() {
  await db.connect();
  let created = 0;
  for (const g of DEFAULT_GIFTS) {
    const existing = await db.Gift.findOne({ id: g.id });
    if (!existing) {
      await db.Gift.create({ ...g, active: true });
      created++;
    }
  }
  console.log('Gifts seeded:', created, 'new,', DEFAULT_GIFTS.length - created, 'existing');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
