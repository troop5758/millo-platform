/**
 * Ads delivery AI — adjusts effective bids using timing and audience heuristics when enabled.
 * Called from @millo/ads deliver(); does not run the auction.
 * https://milloapp.com
 */
const config = require('./config');

function utcHour(d = new Date()) {
  return d.getUTCHours();
}

/**
 * @param {object[]} candidates
 * @param {object} [context] - userCountry, region, country, hourUTC
 * @returns {object[]}
 */
function optimizeAdsCandidates(candidates, context = {}) {
  if (!config.shouldApplyAdsOptimization()) return candidates;
  if (!candidates?.length) return candidates;

  const hour = context.hourUTC != null ? Number(context.hourUTC) : utcHour();
  const safeHour = Number.isFinite(hour) ? hour : utcHour();
  const peakEvening = safeHour >= 17 && safeHour <= 23;
  const peakLunch = safeHour >= 11 && safeHour <= 14;
  const timingMult = peakEvening ? 1.12 : peakLunch ? 1.08 : 1.0;

  const userCountry = context.userCountry || context.region || context.country;
  const audienceMult = userCountry ? 1.06 : 1.0;
  const bidMultiplier = timingMult * audienceMult;

  const timingBand = peakEvening ? 'evening_peak' : peakLunch ? 'midday' : 'off_peak';

  return candidates.map((c) => {
    const base = Number(c.bidCents) || 0;
    return {
      ...c,
      bidCents: Math.max(0, Math.round(base * bidMultiplier)),
      aiAdsOptimization: {
        timingMultiplier: timingMult,
        audienceMultiplier: audienceMult,
        bidMultiplier,
        selectedAudience: userCountry ? String(userCountry).toUpperCase().slice(0, 2) : 'broad',
        timingBand,
      },
    };
  });
}

module.exports = { optimizeAdsCandidates, utcHour };
