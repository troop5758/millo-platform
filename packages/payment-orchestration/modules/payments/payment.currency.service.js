/**
 * Payment currency service — FX conversion, localized amounts.
 * Delegates to @millo/economy currencyService.
 * https://milloapp.com
 */
const { currencyService } = require('@millo/economy');

async function convertUSDToLocal(usdCents, currency) {
  if (!currencyService?.convertUSDToLocal) {
    return usdCents;
  }
  return currencyService.convertUSDToLocal(usdCents, currency);
}

function roundLocalized(amount, currency) {
  if (!currencyService?.roundLocalizedPrices) {
    return Math.round(amount);
  }
  return currencyService.roundLocalizedPrices(amount, currency);
}

module.exports = { convertUSDToLocal, roundLocalized };
