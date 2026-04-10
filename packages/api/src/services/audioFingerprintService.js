'use strict';
/**
 * Audio Fingerprint System — generates a fingerprint for a track (dedup / content ID).
 * Current: hash of (url + title + artist). Can be extended with Chromaprint/AcoustID.
 * https://milloapp.com
 */
const crypto = require('crypto');

/**
 * Generate a deterministic fingerprint string for a track (e.g. for dedup or content ID).
 * @param {object} opts - { streamUrl, title, artist }
 * @returns {string}
 */
function generateFingerprint(opts = {}) {
  const str = [opts.streamUrl, opts.title, opts.artist].filter(Boolean).join('|');
  if (!str) return null;
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex').slice(0, 32);
}

/**
 * Find existing track by fingerprint (avoid duplicates).
 * @param {object} db - database models
 * @param {string} fingerprint
 * @returns {Promise<object|null>}
 */
async function findTrackByFingerprint(db, fingerprint) {
  if (!fingerprint) return null;
  return db.MusicTrack.findOne({ fingerprint, status: 'active' }).lean();
}

module.exports = {
  generateFingerprint,
  findTrackByFingerprint,
};
