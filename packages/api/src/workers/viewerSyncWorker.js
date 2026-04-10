'use strict';
/**
 * Periodic sync: Redis viewer count → LiveStream.meta.viewerCount (Phase 4).
 * Run every 30–60s so discovery/APIs that read from Mongo see current count.
 * https://milloapp.com
 */
const db = require('@millo/database');
const viewerCountRedis = require('../lib/viewerCountRedis');

const DEFAULT_INTERVAL_MS = 45 * 1000; // 45s

let _timer = null;

/**
 * One-off sync: for each live stream, read Redis count and write to LiveStream.meta.viewerCount.
 */
async function runSync() {
  try {
    const streams = await db.LiveStream.find({ status: 'live' }).select('_id').lean();
    for (const s of streams) {
      const streamId = s._id.toString();
      const count = await viewerCountRedis.get(streamId);
      if (count !== null) {
        await db.LiveStream.updateOne(
          { _id: s._id },
          { $set: { viewerCount: count, 'meta.viewerCount': count, updatedAt: new Date() } }
        ).catch(() => {});
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[viewerSyncWorker] runSync error:', e.message);
    }
  }
}

/**
 * Start periodic sync. Stops any existing interval.
 * @param {number} [intervalMs] - interval in ms (default 45s)
 */
function start(intervalMs = DEFAULT_INTERVAL_MS) {
  stop();
  runSync(); // run once immediately
  _timer = setInterval(runSync, intervalMs);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { runSync, start, stop };
