#!/usr/bin/env node
'use strict';
/**
 * Seed Creator Badges — verified, trusted, etc.
 * Run: node scripts/seed-creator-badges.js
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

const DEFAULT_BADGES = [
  { badgeId: 'verified_creator', label: 'Verified Creator', icon: 'check', description: 'Identity verified creator', sortOrder: 0 },
  { badgeId: 'trusted', label: 'Trusted', icon: 'shield', description: 'Trusted by the community', sortOrder: 1 },
  { badgeId: 'top_creator', label: 'Top Creator', icon: 'star', description: 'Top performing creator', sortOrder: 2 },
  { badgeId: 'rising_creator', label: 'Rising Creator', icon: 'trending-up', description: 'Rising creator on the platform', sortOrder: 3 },
  { badgeId: 'live_star', label: 'Live Star', icon: 'broadcast', description: 'Outstanding live stream performer', sortOrder: 4 },
];

async function main() {
  await db.connect();
  let created = 0;
  for (const b of DEFAULT_BADGES) {
    const existing = await db.CreatorBadge.findOne({ badgeId: b.badgeId });
    if (!existing) {
      await db.CreatorBadge.create({ ...b, active: true });
      created++;
    }
  }
  console.log('Creator badges seeded:', created, 'new,', DEFAULT_BADGES.length - created, 'existing');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
