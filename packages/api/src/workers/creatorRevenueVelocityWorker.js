'use strict';
/**
 * Creator Revenue Velocity Detection Worker.
 * Periodically checks creators with recent revenue for unnatural spikes (ratio > 20); flags with revenue_spike.
 * https://milloapp.com
 */
const db = require('@millo/database');
const creatorRevenueVelocityService = require('../services/creatorRevenueVelocityService');

const DEFAULT_INTERVAL_MS = Number(process.env.CREATOR_REVENUE_VELOCITY_INTERVAL_MS) || 15 * 60 * 1000; // 15 min
const LOOKBACK_MS = 60 * 60 * 1000; // creators with revenue in last hour
const BATCH_SIZE = Math.min(100, Math.max(10, Number(process.env.CREATOR_REVENUE_VELOCITY_BATCH_SIZE) || 50));

let _timer = null;
let _log = console;

async function getCreatorsWithRecentRevenue() {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const creatorIds = await db.LedgerEntry.distinct('actorId', {
    type: 'credit',
    amountCents: { $gt: 0 },
    createdAt: { $gte: since },
    actorId: { $exists: true, $ne: null },
  });
  return creatorIds.slice(0, BATCH_SIZE).map((id) => id?.toString?.() || id).filter(Boolean);
}

async function runRevenueVelocityCheck() {
  try {
    const creatorIds = await getCreatorsWithRecentRevenue();
    let flagged = 0;
    for (const creatorId of creatorIds) {
      try {
        const result = await creatorRevenueVelocityService.checkAndFlagRevenueSpike(creatorId);
        if (result.spike) flagged++;
      } catch (e) {
        _log.warn?.({ err: e, creatorId }, '[creatorRevenueVelocityWorker] check error for creator');
      }
    }
    if (flagged > 0) {
      _log.info?.({ flagged, checked: creatorIds.length }, 'Creator revenue velocity: spikes flagged');
    }
  } catch (e) {
    _log.warn?.({ err: e }, '[creatorRevenueVelocityWorker] runRevenueVelocityCheck error');
  }
}

function start(intervalMs = DEFAULT_INTERVAL_MS, log) {
  if (log) _log = log;
  stop();
  runRevenueVelocityCheck();
  _timer = setInterval(runRevenueVelocityCheck, intervalMs);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { start, stop, runRevenueVelocityCheck, getCreatorsWithRecentRevenue };
