'use strict';
/**
 * Exploration bandit — reserve 10–20% of slots for discovery of cold / fresh content.
 * https://milloapp.com
 */

/**
 * Interleave main items with exploration items at fixed ratio.
 * @param {unknown[]} mainItems
 * @param {unknown[]} exploreItems
 * @param {number} [ratio] - Fraction of slots for exploration (e.g. 0.15 = 15%)
 * @param {number} [limit]
 * @returns {unknown[]}
 */
function injectExploration(mainItems, exploreItems, ratio = 0.15, limit = 50) {
  const result = [];
  let mainIdx = 0;
  let expIdx = 0;
  const exploreEvery = Math.max(2, Math.round(1 / ratio));

  while (result.length < limit && (mainIdx < mainItems.length || expIdx < exploreItems.length)) {
    if ((result.length + 1) % exploreEvery === 0 && expIdx < exploreItems.length) {
      result.push(exploreItems[expIdx++]);
    } else if (mainIdx < mainItems.length) {
      result.push(mainItems[mainIdx++]);
    } else if (expIdx < exploreItems.length) {
      result.push(exploreItems[expIdx++]);
    }
  }

  return result;
}

module.exports = {
  injectExploration,
};
