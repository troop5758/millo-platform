/**
 * Live Filters Engine — stub registry, apply with kill-switch and performance guard.
 * Phase 5: no AI host, no commerce. https://milloapp.com
 */

const DEFAULT_MAX_MS = 50;

/** Filter IDs. CSS: grayscale/vintage. WebGL+TF.js: face_smoothing, background_blur, ar_masks. */
const AVAILABLE_FILTER_IDS = Object.freeze([
  'none',
  'passthrough',
  'grayscale',
  'vintage',
  'face_smoothing',
  'background_blur',
  'ar_masks',
]);

/** Filter registry with version pinning. webgl: true = client applies via Live Filters SDK (WebGL + TensorFlow.js). */
const FILTER_REGISTRY = Object.freeze([
  { id: 'none', version: '1.0' },
  { id: 'passthrough', version: '1.0' },
  { id: 'grayscale', version: '1.0', cssFilter: 'grayscale(100%)' },
  { id: 'vintage', version: '1.0', cssFilter: 'sepia(40%) contrast(1.1) saturate(0.8)' },
  { id: 'face_smoothing', version: '1.0', webgl: true, sdk: 'tensorflow', description: 'Face smoothing (WebGL + TensorFlow.js)' },
  { id: 'background_blur', version: '1.0', webgl: true, sdk: 'tensorflow', description: 'Background blur / segmentation' },
  { id: 'ar_masks', version: '1.0', webgl: true, sdk: 'tensorflow', description: 'AR masks / overlays' },
]);

/**
 * Whether filters are enabled (kill-switch). Uses env so API and engine stay in sync.
 * Override by passing getFiltersEnabled to applyFilterWithGuard.
 */
function getFiltersEnabled() {
  return process.env.LIVE_FILTERS_ENABLED !== 'false';
}

function getAvailableFilters() {
  return [...AVAILABLE_FILTER_IDS];
}

/** Returns filters with version for pinning. */
function getAvailableFiltersWithVersions() {
  return [...FILTER_REGISTRY];
}

/** Resolve filter by id and optional version. Returns registry entry or null. */
function resolveFilter(filterId, version) {
  const entry = FILTER_REGISTRY.find((f) => f.id === filterId);
  if (!entry) return null;
  if (version && entry.version !== version) return null;
  return entry;
}

/**
 * Apply a filter. none/passthrough return source unchanged.
 * grayscale/vintage return source with filterConfig for client CSS application.
 * @param {unknown} source - Video URL, object with url, or passthrough value
 * @param {string} [filterId] - Filter id (none, passthrough, grayscale, vintage)
 * @param {{ getEnabled?: () => boolean }} [opts] - getEnabled() overrides env check
 * @returns {Promise<unknown>}
 */
async function applyFilter(source, filterId, opts = {}) {
  const getEnabled = opts.getEnabled || getFiltersEnabled;
  if (!getEnabled()) return source;
  if (!filterId || filterId === 'none' || filterId === 'passthrough') return source;

  const entry = resolveFilter(filterId);
  if (!entry) return source;

  if (entry.webgl) {
    if (typeof source === 'string') {
      return { url: source, filterConfig: { webgl: true, filterId: entry.id, sdk: entry.sdk } };
    }
    if (source && typeof source === 'object') {
      return { ...source, filterConfig: { webgl: true, filterId: entry.id, sdk: entry.sdk } };
    }
    return source;
  }

  if (!entry.cssFilter) return source;
  if (typeof source === 'string') {
    return { url: source, filterConfig: { cssFilter: entry.cssFilter } };
  }
  if (source && typeof source === 'object') {
    return { ...source, filterConfig: { cssFilter: entry.cssFilter } };
  }
  return source;
}

/**
 * Performance guard: apply filter with timeout. If exceeded, returns source unchanged.
 * @param {unknown} source
 * @param {string} [filterId]
 * @param {{ maxMs?: number; getEnabled?: () => boolean }} [opts]
 * @returns {Promise<unknown>}
 */
async function applyFilterWithGuard(source, filterId, opts = {}) {
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  const getEnabled = opts.getEnabled || getFiltersEnabled;
  if (!getEnabled()) return source;

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('FILTER_TIMEOUT')), maxMs);
  });
  try {
    return await Promise.race([
      applyFilter(source, filterId, { getEnabled }),
      timeout,
    ]);
  } catch (e) {
    if (e.message === 'FILTER_TIMEOUT') return source;
    throw e;
  }
}

module.exports = {
  getFiltersEnabled,
  getAvailableFilters,
  getAvailableFiltersWithVersions,
  resolveFilter,
  applyFilter,
  applyFilterWithGuard,
  AVAILABLE_FILTER_IDS,
  FILTER_REGISTRY,
  DEFAULT_MAX_MS,
};
