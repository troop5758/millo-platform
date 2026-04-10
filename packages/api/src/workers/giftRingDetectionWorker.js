'use strict';
/**
 * Gift Ring Detection Worker.
 * Periodically builds gift graph (A→B→C→A), finds 3-cycles with transaction count above threshold, flags clusters.
 * https://milloapp.com
 */
const fraudService = require('../services/fraudService');

const DEFAULT_INTERVAL_MS = Number(process.env.GIFT_RING_DETECTION_INTERVAL_MS) || 60 * 60 * 1000; // 1 hour

let _timer = null;
let _log = console;

async function runGiftRingCheck() {
  try {
    const result = await fraudService.runGiftRingDetectionAndFlag();
    if (result.flaggedCount > 0) {
      _log.info?.(
        { flaggedCount: result.flaggedCount, clusters: result.clusters?.length },
        'Gift ring detection: clusters flagged'
      );
    }
  } catch (e) {
    _log.warn?.({ err: e }, '[giftRingDetectionWorker] runGiftRingCheck error');
  }
}

function start(intervalMs = DEFAULT_INTERVAL_MS, log) {
  if (log) _log = log;
  stop();
  runGiftRingCheck();
  _timer = setInterval(runGiftRingCheck, intervalMs);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { start, stop, runGiftRingCheck };
