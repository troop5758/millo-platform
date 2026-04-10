'use strict';
/**
 * Geo lookup for ATO (impossible travel). Uses MaxMind GeoLite2-City when available.
 * Set GEOIP_DB_PATH to path to GeoLite2-City.mmdb. https://milloapp.com
 */
const path = require('path');

let geoDb = null;
let _initPromise = null;

async function initGeo() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const dbPath = process.env.GEOIP_DB_PATH || path.join(process.cwd(), 'GeoLite2-City.mmdb');
    try {
      const maxmind = require('maxmind');
      geoDb = await maxmind.open(dbPath);
      return geoDb;
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[geo] MaxMind init failed:', err?.message || err);
      }
      return null;
    }
  })();
  return _initPromise;
}

/**
 * Lookup IP. Returns { country, city, latitude, longitude } or null.
 */
function lookup(ip) {
  if (!ip || !geoDb) return null;
  try {
    const result = geoDb.get(ip);
    if (!result) return null;
    const loc = result.location;
    return {
      country: result.country?.iso_code || result.country?.names?.en || null,
      city: result.city?.names?.en || null,
      latitude: loc?.latitude ?? null,
      longitude: loc?.longitude ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Async lookup after ensuring DB is inited (e.g. at first request).
 */
async function lookupAsync(ip) {
  if (!ip) return null;
  await initGeo();
  return lookup(ip);
}

function isEnabled() {
  return !!geoDb;
}

module.exports = { initGeo, lookup, lookupAsync, isEnabled };
