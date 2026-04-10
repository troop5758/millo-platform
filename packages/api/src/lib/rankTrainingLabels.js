'use strict';
/**
 * Supervised label taxonomy for ranking (join with impressions / features offline).
 *
 * Positive: watched 6s+, completed, liked, shared, followed, gifted, purchased
 * Negative: skipped under 2s, not interested, report
 *
 * Event types align with FeedEvent / feed.* Kafka payloads (`eventType` or `type`).
 * https://milloapp.com
 */

/** @type {ReadonlySet<string>} */
const POSITIVE_EVENT_TYPES = new Set([
  'watch_6s',
  'watch_15s',
  'complete',
  'like',
  'comment',
  'share',
  'follow_creator',
  'gift',
  'purchase',
]);

/** @type {ReadonlySet<string>} */
const NEGATIVE_EVENT_TYPES = new Set(['skip_fast', 'not_interested', 'report']);

/** Short watch on feed.watch → negative (skipped under ~2s). */
const SHORT_WATCH_MS = 2000;

/**
 * Normalize event name from payload.
 * @param {object} p
 * @returns {string}
 */
function eventTypeOf(p) {
  const t = p.eventType ?? p.type ?? p.event ?? '';
  return String(t).toLowerCase().trim();
}

/**
 * Derive training labels from a feed pipeline Kafka message.
 * @param {string} topic - feed.watch | feed.engagement | feed.negative
 * @param {object} payload
 * @returns {{ labels: string[], polarity: 'positive'|'negative'|'mixed'|null, reason?: string }|null} null if not a training signal
 */
function deriveLabels(topic, payload) {
  const t = String(topic || '').trim();
  const p = payload && typeof payload === 'object' ? payload : {};
  const ev = eventTypeOf(p);
  const labels = [];

  if (t === 'feed.negative') {
    if (!ev || !NEGATIVE_EVENT_TYPES.has(ev)) {
      return null;
    }
    if (ev === 'skip_fast') labels.push('negative_skip_fast');
    if (ev === 'not_interested') labels.push('negative_not_interested');
    if (ev === 'report') labels.push('negative_report');
    return { labels, polarity: 'negative' };
  }

  if (topic.includes('feed.engagement') || /engagement/.test(topic)) {
    if (!ev || !POSITIVE_EVENT_TYPES.has(ev)) {
      return null;
    }
    const map = {
      like: 'positive_like',
      comment: 'positive_comment',
      share: 'positive_share',
      follow_creator: 'positive_follow',
      gift: 'positive_gift',
      purchase: 'positive_purchase',
    };
    if (map[ev]) labels.push(map[ev]);
    return labels.length ? { labels, polarity: 'positive' } : null;
  }

  if (t === 'feed.watch') {
    if (ev === 'watch_6s' || ev === 'watch_15s') {
      labels.push(ev === 'watch_6s' ? 'positive_watch_6s' : 'positive_watch_15s');
      return { labels, polarity: 'positive' };
    }
    if (ev === 'complete') {
      labels.push('positive_complete');
      return { labels, polarity: 'positive' };
    }
    const wms = Number(p.watchTimeMs ?? p.watch_time_ms ?? p.watchMs);
    if (Number.isFinite(wms) && wms > 0 && wms < SHORT_WATCH_MS && (ev === 'play' || ev === 'watch_2s' || !ev)) {
      labels.push('negative_skip_under_2s');
      return { labels, polarity: 'negative', reason: 'watchTimeMs' };
    }
    return null;
  }

  return null;
}

module.exports = {
  deriveLabels,
  POSITIVE_EVENT_TYPES,
  NEGATIVE_EVENT_TYPES,
  SHORT_WATCH_MS,
  eventTypeOf,
};
