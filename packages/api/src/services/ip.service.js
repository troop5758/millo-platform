'use strict';
/**
 * Offline IP → country via geoip-lite (MaxMind GeoLite derived data bundled in package).
 * https://milloapp.com
 */
const geoip = require('geoip-lite');

/**
 * @param {string} [ip]
 * @returns {string} ISO 3166-1 alpha-2 country code, or UNKNOWN
 */
function getGeo(ip) {
  if (!ip || typeof ip !== 'string') return 'UNKNOWN';
  const geo = geoip.lookup(ip.trim());
  return (geo && geo.country) || 'UNKNOWN';
}

module.exports = {
  getGeo,
};
