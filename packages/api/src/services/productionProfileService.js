'use strict';
/**
 * Loads repo-root config/production-profile.json — env, feature flags, production guards.
 * Optional labels map (LIVE / PARTIAL / EXPERIMENTAL) for ops UI when present.
 * Cached by mtime. Override: MILLO_PRODUCTION_PROFILE_PATH (absolute path).
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');

const VALID_LABELS = new Set(['LIVE', 'PARTIAL', 'EXPERIMENTAL']);

let cachedDoc = null;
let cachedMtime = null;

function defaultProfilePath() {
  return path.join(__dirname, '../../../../config/production-profile.json');
}

function resolvePath() {
  const override = process.env.MILLO_PRODUCTION_PROFILE_PATH;
  if (override && String(override).trim()) return path.resolve(String(override).trim());
  return defaultProfilePath();
}

function loadRaw() {
  const p = resolvePath();
  try {
    const st = fs.statSync(p);
    if (cachedDoc && cachedMtime === st.mtimeMs) return { ok: true, doc: cachedDoc, path: p };
    const raw = fs.readFileSync(p, 'utf8');
    const doc = JSON.parse(raw);
    if (!doc || typeof doc.features !== 'object' || doc.features === null) {
      throw new Error('INVALID_PROFILE: missing features object');
    }
    if (doc.guards != null && (typeof doc.guards !== 'object' || Array.isArray(doc.guards))) {
      throw new Error('INVALID_PROFILE: guards must be an object');
    }
    cachedDoc = doc;
    cachedMtime = st.mtimeMs;
    return { ok: true, doc: cachedDoc, path: p };
  } catch (err) {
    return { ok: false, error: err.message, path: p };
  }
}

function normalizeLabel(raw) {
  const s = String(raw || '').toUpperCase();
  if (VALID_LABELS.has(s)) return s;
  return 'EXPERIMENTAL';
}

/**
 * @returns {{
 *   ok: boolean,
 *   path: string,
 *   error?: string,
 *   env: string,
 *   features: Record<string, boolean>,
 *   guards: Record<string, boolean>,
 *   labels: Record<string, string>,
 *   rows: Array<{ id: string, enabled: boolean, label?: string }>,
 *   guardRows: Array<{ id: string, required: boolean }>
 * }}
 */
function getProductionProfilePayload() {
  const loaded = loadRaw();
  if (!loaded.ok) {
    return {
      ok: false,
      path: loaded.path,
      error: loaded.error,
      env: 'unknown',
      features: {},
      guards: {},
      labels: {},
      rows: [],
      guardRows: [],
    };
  }
  const doc = loaded.doc;
  const features = { ...doc.features };
  const guards = doc.guards && typeof doc.guards === 'object' && !Array.isArray(doc.guards) ? { ...doc.guards } : {};
  const labelsRaw = doc.labels && typeof doc.labels === 'object' && !Array.isArray(doc.labels) ? doc.labels : null;
  const env = typeof doc.env === 'string' && doc.env.trim() ? doc.env.trim() : 'unknown';

  const rows = Object.keys(features).map((id) => {
    const row = { id, enabled: features[id] === true };
    if (labelsRaw) row.label = normalizeLabel(labelsRaw[id]);
    return row;
  });

  const labelsOut = labelsRaw
    ? Object.fromEntries(rows.filter((r) => r.label).map((r) => [r.id, r.label]))
    : {};

  const guardRows = Object.keys(guards).map((id) => ({
    id,
    required: guards[id] === true,
  }));

  return {
    ok: true,
    path: loaded.path,
    env,
    features,
    guards,
    labels: labelsOut,
    rows,
    guardRows,
  };
}

module.exports = {
  getProductionProfilePayload,
  loadRaw,
  VALID_LABELS,
};
