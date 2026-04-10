'use strict';
/**
 * Periodic trust score history snapshots — appends TrustHistory for users with AccountTrustScore.
 * Runs on interval so admin timeline has historical points. https://milloapp.com
 */
const db = require('@millo/database');
const trustHistoryService = require('../services/trustHistoryService');

const DEFAULT_INTERVAL_MS = Number(process.env.TRUST_SNAPSHOT_INTERVAL_MS) || 60 * 60 * 1000; // 1 hour
const BATCH_SIZE = Math.min(1000, Math.max(50, Number(process.env.TRUST_SNAPSHOT_BATCH_SIZE) || 200));

let _timer = null;

async function runSnapshot() {
  try {
    const docs = await db.AccountTrustScore.find({})
      .select('userId score factors')
      .limit(BATCH_SIZE)
      .lean();
    for (const doc of docs) {
      if (doc.userId && doc.score != null) {
        await trustHistoryService.snapshot(doc.userId, doc.score, doc.factors || {});
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[trustSnapshotWorker] runSnapshot error:', e?.message);
    }
  }
}

/**
 * Start periodic snapshot. Stops any existing interval.
 * @param {number} [intervalMs] - interval in ms (default 1 hour)
 */
function start(intervalMs = DEFAULT_INTERVAL_MS) {
  stop();
  runSnapshot();
  _timer = setInterval(runSnapshot, intervalMs);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { start, stop, runSnapshot };
