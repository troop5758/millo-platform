/**
 * Live Filters SDK — intentional placeholder.
 *
 * Pipeline direction: browser preview can use Canvas 2D / WebGL on a MediaStream
 * (see `startCanvasFilteredPreview`); ingest often terminates on Janus WebRTC / SFU
 * before HLS. Server-side RTMP → transcoder filters apply when the kill-switch is on.
 *
 * To enable filters:  POST /dashboards/admin/kill-switch { which: 'liveFilters', enabled: true }
 * https://milloapp.com
 */

import { API_BASE } from '../config/api.js';

const DEFAULT_BASE_URL = API_BASE;

/** Client-side filter map (mirrors filtersEngine). Used for CSS application on video element. */
const CLIENT_FILTER_MAP = Object.freeze({
  grayscale: 'grayscale(100%)',
  vintage: 'sepia(40%) contrast(1.1) saturate(0.8)',
});

/**
 * Get CSS filter string for a filter ID. Returns null for none/passthrough or unknown.
 * @param {string} [filterId]
 * @returns {string|null}
 */
export function getCssFilterForId(filterId) {
  if (!filterId || filterId === 'none' || filterId === 'passthrough') return null;
  return CLIENT_FILTER_MAP[filterId] ?? null;
}

/**
 * Check whether the live-filters feature flag is enabled on this deployment.
 * Returns false on any network/parse error so callers degrade gracefully.
 */
export async function isEnabled(baseUrl = DEFAULT_BASE_URL) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/live/filters/status`);
    const data = await res.json();
    return data.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Apply a named filter to a video source.
 *
 * Currently a pass-through — the filter pipeline is not yet implemented in the
 * browser client.  When the kill-switch is on, the transcoder applies the
 * selected filter server-side; `source` is returned unchanged here so the
 * player continues without interruption.
 *
 * @param {string}  baseUrl  - API base URL (defaults to VITE_API_URL)
 * @param {unknown} source   - MediaStream, HLS URL, or playback config
 * @param {string}  filterId - Filter identifier (e.g. 'blur_bg', 'vivid')
 * @returns {Promise<unknown>} The (unmodified) source
 */
export async function applyFilter(baseUrl = DEFAULT_BASE_URL, source, filterId) { // eslint-disable-line no-unused-vars
  return source;
}

/**
 * Resolve filter by name and optional version. For stable recordings, pin to a specific version.
 * @param {string} name - Filter name (e.g. 'beauty')
 * @param {string} [version] - Version to pin (e.g. '1.0.2'). Omit for latest active.
 * @returns {Promise<{ name, version, is_active }|null>}
 */
export async function resolveFilter(name, version, baseUrl = DEFAULT_BASE_URL) {
  try {
    const url = version
      ? `${baseUrl.replace(/\/$/, '')}/live/filters/${encodeURIComponent(name)}?version=${encodeURIComponent(version)}`
      : `${baseUrl.replace(/\/$/, '')}/live/filters/${encodeURIComponent(name)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Draw video frames through Canvas 2D CSS filters and expose a new MediaStream via
 * captureStream (client-side preview / low-latency effects). Stop when done to end tracks.
 * For SFU paths (e.g. Janus), publish the resulting stream or use server-side filters instead.
 *
 * @param {HTMLVideoElement} videoEl
 * @param {string} [filterId]
 * @param {{ fps?: number }} [opts]
 * @returns {{ stream: MediaStream|null, stop: () => void }}
 */
export function startCanvasFilteredPreview(videoEl, filterId, opts = {}) {
  if (typeof window === 'undefined' || !videoEl || !videoEl.tagName || videoEl.tagName !== 'VIDEO') {
    return { stream: null, stop() {} };
  }
  const fps = Math.min(60, Math.max(8, Number(opts.fps) || 30));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { stream: null, stop() {} };

  const cssFilter = getCssFilterForId(filterId) || 'none';
  let raf = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 360;
    if (w > 0 && h > 0) {
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.filter = cssFilter;
      ctx.drawImage(videoEl, 0, 0, w, h);
    }
    raf = requestAnimationFrame(tick);
  };

  const stream = canvas.captureStream(fps);
  raf = requestAnimationFrame(tick);

  return {
    stream,
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      stream.getTracks().forEach((tr) => tr.stop());
    },
  };
}
