'use strict';
/**
 * Ensures default music licenses exist for the royalty-free library.
 * https://milloapp.com
 */
const db = require('@millo/database');

const DEFAULTS = [
  { name: 'Millo Royalty-Free', slug: 'millo-royalty-free', description: 'Use in platform streams and VODs without additional fees.', allowsCommercial: true, requiresAttribution: false },
  { name: 'CC BY', slug: 'cc-by', description: 'Creative Commons Attribution. Credit the artist.', url: 'https://creativecommons.org/licenses/by/4.0/', allowsCommercial: true, requiresAttribution: true },
];

async function ensureDefaultMusicLicenses(log = console) {
  for (const d of DEFAULTS) {
    const exists = await db.MusicLicense.findOne({ slug: d.slug }).lean();
    if (!exists) {
      await db.MusicLicense.create(d);
      log.info({ slug: d.slug }, 'Default music license created.');
    }
  }
}

module.exports = { ensureDefaultMusicLicenses };
