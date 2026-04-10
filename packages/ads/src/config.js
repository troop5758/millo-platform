/**
 * Ads config — kill-switch. When false, delivery halts.
 * https://milloapp.com
 */
function getAdsEnabled() {
  return process.env.ADS_ENABLED !== 'false';
}

module.exports = { getAdsEnabled };
