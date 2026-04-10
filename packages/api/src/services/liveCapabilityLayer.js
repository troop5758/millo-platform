'use strict';
/**
 * Live Capability Layer — honest LIVE | STUBBED | OFF for streaming stack vs ingest filters.
 * Shared by GET /api/system/control-plane and GET /api/live/status.
 * https://milloapp.com
 */

/**
 * Full playback + realtime posture (Janus + HLS, or RTMP path).
 * @returns {'LIVE'|'STUBBED'|'OFF'}
 */
function resolveLiveStreamingPublic() {
  const janus = !!(process.env.JANUS_GATEWAY_URL || process.env.JANUS_URL);
  const rtmp = !!process.env.RTMP_URL;
  const hls = !!(process.env.HLS_URL || process.env.HLS_PLAYBACK_URL);
  if (!janus && !rtmp) return 'OFF';
  if (janus && hls) return 'LIVE';
  return 'STUBBED';
}

/**
 * Ingest / client filter pipeline — LIVE only when operator enables.
 * @returns {'LIVE'|'STUBBED'}
 */
function filtersMode() {
  const live =
    String(process.env.LIVE_FILTERS_LIVE || '').toLowerCase() === 'true'
    || String(process.env.LIVE_FILTERS_ENABLED || '').toLowerCase() === 'true';
  return live ? 'LIVE' : 'STUBBED';
}

/**
 * @returns {{ streaming: 'LIVE'|'STUBBED'|'OFF', filters: 'LIVE'|'STUBBED' }}
 */
function getLiveCapabilityLayer() {
  return {
    streaming: resolveLiveStreamingPublic(),
    filters: filtersMode(),
  };
}

module.exports = {
  resolveLiveStreamingPublic,
  filtersMode,
  getLiveCapabilityLayer,
};
