'use strict';
/**
 * Operational feature toggles (ads, MILLA, live filters) — persisted in PlatformSettings, applied to process.env.
 * Replaces env-only / dev-only flip patterns; RBAC enforced in callers (admin | support | ops).
 * Key: millo_feature_toggles → { ads, milla, filters } booleans.
 * https://milloapp.com
 */
const db = require('@millo/database');

const KEY = 'millo_feature_toggles';

function filtersLiveEffectiveFromEnv() {
  return (
    String(process.env.LIVE_FILTERS_LIVE || '').toLowerCase() === 'true'
    || String(process.env.LIVE_FILTERS_ENABLED || '').toLowerCase() === 'true'
  );
}

function getEffectiveFromEnv() {
  return {
    ads: process.env.ADS_ENABLED !== 'false',
    milla: process.env.MILLA_ENABLED !== 'false',
    filters: filtersLiveEffectiveFromEnv(),
  };
}

function applyToEnv(toggles) {
  if (!toggles || typeof toggles !== 'object') return;
  process.env.ADS_ENABLED = toggles.ads ? 'true' : 'false';
  process.env.MILLA_ENABLED = toggles.milla ? 'true' : 'false';
  const f = toggles.filters ? 'true' : 'false';
  process.env.LIVE_FILTERS_ENABLED = f;
  process.env.LIVE_FILTERS_LIVE = f;
}

/**
 * @param {string} which - ads | milla | filters | liveFilters | live_filters
 * @returns {'ads'|'milla'|'filters'|null}
 */
function normalizeWhich(which) {
  const w = String(which || '').toLowerCase().replace(/-/g, '_');
  if (w === 'ads') return 'ads';
  if (w === 'milla') return 'milla';
  if (w === 'filters' || w === 'livefilters' || w === 'live_filters') return 'filters';
  return null;
}

async function hydrateFromDb() {
  try {
    const doc = await db.PlatformSettings.findOne({ key: KEY }).lean();
    if (!doc?.value || typeof doc.value !== 'object') return;
    const v = doc.value;
    const eff = getEffectiveFromEnv();
    const merged = {
      ads: v.ads !== undefined ? !!v.ads : eff.ads,
      milla: v.milla !== undefined ? !!v.milla : eff.milla,
      filters: v.filters !== undefined ? !!v.filters : eff.filters,
    };
    applyToEnv(merged);
  } catch (e) {
    console.warn('[millo_feature_toggles] hydrate failed:', e.message);
  }
}

/**
 * @param {string} whichKey
 * @param {boolean} enabled
 * @param {string|null|undefined} updatedBy
 */
async function setToggle(whichKey, enabled, updatedBy) {
  const norm = normalizeWhich(whichKey);
  if (!norm) {
    const err = new Error('INVALID_TOGGLE');
    err.code = 'INVALID_TOGGLE';
    throw err;
  }
  const existing = await db.PlatformSettings.findOne({ key: KEY }).lean();
  const cur = existing?.value && typeof existing.value === 'object' ? { ...existing.value } : {};
  const eff = getEffectiveFromEnv();
  const next = {
    ads: cur.ads !== undefined ? !!cur.ads : eff.ads,
    milla: cur.milla !== undefined ? !!cur.milla : eff.milla,
    filters: cur.filters !== undefined ? !!cur.filters : eff.filters,
    [norm]: !!enabled,
  };
  await db.PlatformSettings.findOneAndUpdate(
    { key: KEY },
    { $set: { key: KEY, value: next, updatedBy: updatedBy != null ? String(updatedBy) : null } },
    { upsert: true }
  );
  applyToEnv(next);
  return next;
}

function getEffective() {
  return getEffectiveFromEnv();
}

module.exports = {
  KEY,
  normalizeWhich,
  hydrateFromDb,
  setToggle,
  getEffective,
  getEffectiveFromEnv,
};
