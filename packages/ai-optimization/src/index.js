/**
 * AI optimization — ranking/ads injection hooks + advisory suggest* APIs.
 * Discovery (`rankDiscovery`) and ads (`deliver`) may call exported optimizers; this package does not import them.
 * https://milloapp.com
 */
const config = require('./config');
const rankingOptimizer = require('./rankingOptimizer');
const bidOptimizer = require('./bidOptimizer');
const shadowLog = require('./shadowLog');
const { optimizeAdsCandidates } = require('./adsDeliveryOptimizer');

module.exports = {
  ...config,
  ...rankingOptimizer,
  ...bidOptimizer,
  ...shadowLog,
  optimizeAdsCandidates,
};
