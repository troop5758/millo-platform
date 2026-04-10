'use strict';
/**
 * Live subsystem mode contract — honest LIVE vs STUBBED for WebRTC and filters.
 * GET /api/live/status https://milloapp.com
 */
const { resolveLiveStreamingPublic, filtersMode, getLiveCapabilityLayer } = require('./liveCapabilityLayer');

/**
 * @returns {'LIVE'|'STUBBED'}
 */
function webrtcMode() {
  const j = String(process.env.JANUS_GATEWAY_URL || process.env.JANUS_URL || '').trim();
  return j ? 'LIVE' : 'STUBBED';
}

/**
 * @returns {object} Public contract for dashboards — no secrets; honest about stubs and worker posture.
 */
function getLiveModeStatus() {
  const webrtc = webrtcMode();
  const filters = filtersMode();
  const live = getLiveCapabilityLayer();
  const auctionWorkerOff = String(process.env.COMMERCE_DISABLE_AUCTION_PAYMENT_WORKER || '').toLowerCase() === 'true';
  return {
    webrtc,
    filters,
    /** Same as control plane root `live` — frontend contract for streaming vs filters. */
    live,
    webrtcNote:
      webrtc === 'LIVE'
        ? 'Janus URL is set; signaling targets a real gateway.'
        : 'No JANUS_GATEWAY_URL / JANUS_URL — treat WebRTC as limited or stubbed.',
    filtersNote:
      filters === 'LIVE'
        ? 'Operator enabled LIVE_FILTERS_LIVE and/or LIVE_FILTERS_ENABLED.'
        : 'Ingest filters are stubbed until LIVE_FILTERS_LIVE or LIVE_FILTERS_ENABLED is true.',
    /** POST /live/join writes DeviceAnalytics when the client sends device/os/browser. */
    liveJoinDeviceAnalytics: true,
    /** In-process auction payment deadline loop (non-BullMQ) in API unless disabled. */
    auctionPaymentEnforcement: auctionWorkerOff ? 'OFF' : 'LIVE',
  };
}

module.exports = { getLiveModeStatus, webrtcMode, filtersMode };
