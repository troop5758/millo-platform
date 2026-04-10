'use strict';
/**
 * Regional subscription list price (USD, monthly-style quote).
 * price = region === "US" ? 10 : 5
 * https://milloapp.com
 */

function normalizeRegionCode(region) {
  if (region == null || region === '') return 'US';
  return String(region).trim().toUpperCase().slice(0, 2);
}

function regionalSubscriptionPriceUsd(region) {
  return normalizeRegionCode(region) === 'US' ? 10 : 5;
}

function regionalSubscriptionPriceCents(region) {
  return Math.round(regionalSubscriptionPriceUsd(region) * 100);
}

/** @param {{ body?: object, query?: object, headers?: Record<string, string> }} request */
function resolveRegionFromRequest(request) {
  const body = request.body && typeof request.body === 'object' ? request.body : {};
  const q = request.query && typeof request.query === 'object' ? request.query : {};
  const h = request.headers || {};
  const raw =
    (typeof body.region === 'string' && body.region.trim() && body.region) ||
    (typeof q.region === 'string' && q.region.trim() && q.region) ||
    h['x-region'] ||
    h['x-user-region'] ||
    h['cf-ipcountry'] ||
    'US';
  return normalizeRegionCode(raw);
}

module.exports = {
  normalizeRegionCode,
  regionalSubscriptionPriceUsd,
  regionalSubscriptionPriceCents,
  resolveRegionFromRequest,
};
