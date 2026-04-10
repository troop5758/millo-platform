'use strict';
/**
 * Engagement Velocity + Device Cluster Detection Worker.
 * Runs periodically: finds streams with recent viewer activity; runs velocity spike and device-cluster checks.
 * Velocity: lastMinute/avgLastHour > 15 → flag. Device cluster: uniqueDevices/interactions < 0.2 → flag.
 * https://milloapp.com
 */
const db = require('@millo/database');
const engagementVelocityService = require('../services/engagementVelocityService');

const DEFAULT_INTERVAL_MS = Number(process.env.ENGAGEMENT_VELOCITY_INTERVAL_MS) || 2 * 60 * 1000; // 2 min
const BATCH_SIZE = Math.min(200, Math.max(20, Number(process.env.ENGAGEMENT_VELOCITY_BATCH_SIZE) || 50));
const LOOKBACK_MS = 5 * 60 * 1000; // consider streams with viewer joins in last 5 min

let _timer = null;
let _log = console;

async function runVelocityCheck() {
  try {
    const since = new Date(Date.now() - LOOKBACK_MS);
    const streamIds = await db.LiveViewer.distinct('streamId', { joinedAt: { $gte: since } })
      .then((ids) => ids.slice(0, BATCH_SIZE));
    if (streamIds.length === 0) return;

    for (const contentId of streamIds) {
      const cidStr = contentId?.toString?.() || contentId;
      try {
        const velocityResult = await engagementVelocityService.detectVelocitySpike(contentId, 'stream');
        if (velocityResult.spike) {
          await engagementVelocityService.flagContent(contentId, 'velocity_spike', {
            ratio: velocityResult.ratio,
            lastMinute: velocityResult.lastMinute,
            avgLastHour: velocityResult.avgLastHour,
          });
          _log.info?.(
            { contentId: cidStr, ratio: velocityResult.ratio, lastMinute: velocityResult.lastMinute, avgLastHour: velocityResult.avgLastHour },
            'Engagement velocity spike flagged'
          );
        }
      } catch (e) {
        _log.warn?.({ err: e, contentId: cidStr }, 'Velocity check error for content');
      }
      try {
        const clusterResult = await engagementVelocityService.checkAndFlagDeviceCluster(contentId, 'stream');
        if (clusterResult.flagged) {
          _log.info?.(
            { contentId: cidStr, ratio: clusterResult.ratio, deviceCount: clusterResult.deviceCount, interactionCount: clusterResult.interactionCount },
            'Device cluster flagged'
          );
        }
      } catch (e) {
        _log.warn?.({ err: e, contentId: cidStr }, 'Device cluster check error for content');
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      _log.warn?.({ err: e }, '[engagementVelocityWorker] runVelocityCheck error');
    }
  }
}

/**
 * Start periodic velocity detection. Stops any existing interval.
 * @param {number} [intervalMs] - interval in ms (default 2 min)
 * @param {Object} [log] - logger (default console)
 */
function start(intervalMs = DEFAULT_INTERVAL_MS, log) {
  if (log) _log = log;
  stop();
  runVelocityCheck();
  _timer = setInterval(runVelocityCheck, intervalMs);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { start, stop, runVelocityCheck };
