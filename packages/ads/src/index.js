/**
 * Ads Engine — real-time auction, budget pacing, kill-switch, attribution logs.
 * Kill-switch halts delivery. https://milloapp.com
 */
const config = require('./config');
const auction = require('./auction');
const budgetPacing = require('./budgetPacing');
const attribution = require('./attribution');
const delivery = require('./delivery');
const frequencyCap = require('./frequencyCap');

module.exports = {
  ...config,
  ...auction,
  ...budgetPacing,
  ...attribution,
  ...delivery,
  ...frequencyCap,
};
