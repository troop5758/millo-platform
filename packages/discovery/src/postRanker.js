'use strict';
/**
 * Diversity + caps — prevent repetitive feed (creator/topic saturation).
 * https://milloapp.com
 */

function sid(v) {
  if (v == null) return '';
  return String(v);
}

/**
 * @param {Array<{ item: object, scores?: { finalScore?: number } }>} scoredItems
 * @param {{ maxPerCreator?: number, maxPerTopic?: number, limit?: number }} [options]
 * @returns {Array<{ item: object, scores?: object }>}
 */
function diversifyAndCap(scoredItems, options = {}) {
  const maxPerCreator = options.maxPerCreator ?? 2;
  const maxPerTopic = options.maxPerTopic ?? 3;
  const limit = options.limit ?? 50;

  const creatorCounts = new Map();
  const topicCounts = new Map();
  const output = [];

  const sorted = [...scoredItems].sort((a, b) => {
    const sa = a.scores?.finalScore ?? 0;
    const sb = b.scores?.finalScore ?? 0;
    return sb - sa;
  });

  for (const row of sorted) {
    if (output.length >= limit) break;

    const creatorId = sid(row.item?.creatorId ?? '');
    const creatorCount = creatorCounts.get(creatorId) ?? 0;
    if (creatorCount >= maxPerCreator) continue;

    const dominantTopic = row.item?.topics?.[0];
    const topic = typeof dominantTopic === 'string' ? dominantTopic : 'unknown';
    const topicCount = topicCounts.get(topic) ?? 0;
    if (topicCount >= maxPerTopic) continue;

    output.push(row);
    creatorCounts.set(creatorId, creatorCount + 1);
    topicCounts.set(topic, topicCount + 1);
  }

  return output;
}

module.exports = {
  diversifyAndCap,
};
