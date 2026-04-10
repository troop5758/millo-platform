'use strict';
/**
 * Trend Manipulation Detection Worker.
 * Periodically checks hashtags: low creator diversity (high usage, few creators) and geo cluster (low geo spread).
 * https://milloapp.com
 */
const db = require('@millo/database');
const trendManipulationService = require('../services/trendManipulationService');

const DEFAULT_INTERVAL_MS = Number(process.env.TREND_MANIPULATION_INTERVAL_MS) || 15 * 60 * 1000; // 15 min
const BATCH_SIZE = Math.min(100, Math.max(10, Number(process.env.TREND_MANIPULATION_BATCH_SIZE) || 30));
const LOW_DIVERSITY_USAGE_MIN = Number(process.env.TREND_LOW_DIVERSITY_USAGE_MIN) || 1000;
const LOW_DIVERSITY_CREATORS_MAX = Number(process.env.TREND_LOW_DIVERSITY_CREATORS_MAX) || 50;
const GEO_CLUSTER_SPREAD_MAX = Number(process.env.TREND_GEO_CLUSTER_SPREAD_MAX) ?? 0.2; // geoSpread < 0.2 → flag
const LOOKBACK_MS = 24 * 60 * 60 * 1000; // streams with tag usage in last 24h

let _timer = null;
let _log = console;

async function getActiveHashtags() {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const streams = await db.LiveStream.find({ createdAt: { $gte: since }, tags: { $exists: true, $ne: [] } })
    .select('tags')
    .limit(5000)
    .lean();
  const tagSet = new Set();
  for (const s of streams) {
    for (const t of s.tags || []) {
      const n = trendManipulationService.normalizeTag(t);
      if (n) tagSet.add(n);
    }
  }
  return [...tagSet].slice(0, BATCH_SIZE);
}

/**
 * Run trend manipulation detection for a single hashtag.
 * Flags: low_creator_diversity (usageCount > 1000 && uniqueCreators < 50), geo_cluster (geoSpread < 0.2).
 * @param {string} hashtag
 */
async function detectTrendManipulation(hashtag) {
  const stats = await trendManipulationService.collectHashtagStats(hashtag);

  if (stats.usageCount > LOW_DIVERSITY_USAGE_MIN && stats.uniqueCreators < LOW_DIVERSITY_CREATORS_MAX) {
    await trendManipulationService.flagHashtag(hashtag, 'low_creator_diversity', {
      usageCount: stats.usageCount,
      uniqueCreators: stats.uniqueCreators,
    });
    _log.info?.(
      { hashtag, usageCount: stats.usageCount, uniqueCreators: stats.uniqueCreators },
      'Trend manipulation: low_creator_diversity flagged'
    );
  }

  if (stats.geoSpread < GEO_CLUSTER_SPREAD_MAX) {
    await trendManipulationService.flagHashtag(hashtag, 'geo_cluster', {
      geoSpread: stats.geoSpread,
    });
    _log.info?.(
      { hashtag, geoSpread: stats.geoSpread },
      'Trend manipulation: geo_cluster flagged'
    );
  }
}

async function runTrendManipulationCheck() {
  try {
    const hashtags = await getActiveHashtags();
    if (hashtags.length === 0) return;

    for (const hashtag of hashtags) {
      try {
        await detectTrendManipulation(hashtag);
      } catch (e) {
        _log.warn?.({ err: e, hashtag }, 'Trend manipulation check error for hashtag');
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      _log.warn?.({ err: e }, '[trendManipulationWorker] runTrendManipulationCheck error');
    }
  }
}

/**
 * Start periodic trend manipulation detection.
 * @param {number} [intervalMs] - interval in ms (default 15 min)
 * @param {Object} [log] - logger
 */
function start(intervalMs = DEFAULT_INTERVAL_MS, log) {
  if (log) _log = log;
  stop();
  runTrendManipulationCheck();
  _timer = setInterval(runTrendManipulationCheck, intervalMs);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { start, stop, detectTrendManipulation, runTrendManipulationCheck, getActiveHashtags };
