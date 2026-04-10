/**
 * Live mode contract from GET /api/live/status (webrtc / filters LIVE | STUBBED).
 * https://milloapp.com
 */

const DEFAULT = Object.freeze({
  webrtc: 'STUBBED',
  filters: 'STUBBED',
  live: { streaming: 'OFF', filters: 'STUBBED' },
});

let cache = null;
let inflight = null;

/**
 * @param {string} apiBase
 * @returns {Promise<{ webrtc: 'LIVE'|'STUBBED', filters: 'LIVE'|'STUBBED', live: { streaming: string, filters: string } }>}
 */
export async function loadLiveModeStatus(apiBase) {
  const base = String(apiBase || '').replace(/\/$/, '');
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch(`${base}/api/live/status`)
      .then(async (r) => {
        if (!r.ok) {
          cache = { ...DEFAULT };
          return cache;
        }
        const d = await r.json().catch(() => null);
        if (!d || typeof d !== 'object') {
          cache = { ...DEFAULT };
          return cache;
        }
        const webrtc = d.webrtc === 'LIVE' ? 'LIVE' : 'STUBBED';
        const filters = d.filters === 'LIVE' ? 'LIVE' : 'STUBBED';
        let live;
        if (d.live && typeof d.live === 'object') {
          const st = d.live.streaming;
          const fi = d.live.filters === 'LIVE' ? 'LIVE' : 'STUBBED';
          const streaming =
            st === 'LIVE' || st === 'OFF' || st === 'STUBBED' ? st : 'STUBBED';
          live = { streaming, filters: fi };
        } else {
          live = { streaming: 'STUBBED', filters };
        }
        cache = { webrtc, filters, live };
        return cache;
      })
      .catch(() => {
        cache = { ...DEFAULT };
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function clearLiveModeStatusCache() {
  cache = null;
}
