/**
 * Coin Conversion Service - coins to USD. Creator earnings from gifts.
 * https://milloapp.com
 */
let pricing;
try {
  pricing = require('@millo/economy').pricing;
} catch (_) {}

const COINS_PER_DOLLAR = 100;

/** Creator payout: $ per coin. 100 coins = $6.50 → 0.065 */
const COIN_TO_USD_RATE = 0.065;

function centsToCoins(cents) {
  return Math.round(((cents || 0) / 100) * COINS_PER_DOLLAR);
}

function coinsToCents(coins) {
  return Math.round(((coins || 0) * 100) / COINS_PER_DOLLAR);
}

function getCoinsPerDollar() {
  return pricing && pricing.coinsPerDollar ? pricing.coinsPerDollar : COINS_PER_DOLLAR;
}

/**
 * Convert coins to USD (creator earnings). Example: 100 coins = $6.50.
 */
function convertCoinsToUSD(coins) {
  const rate = (pricing && pricing.coinToUsdRate) ?? COIN_TO_USD_RATE;
  return (coins || 0) * rate;
}

/** Convert coins to cents (for ledger/payout). */
function convertCoinsToCents(coins) {
  return Math.round(convertCoinsToUSD(coins) * 100);
}

module.exports = {
  centsToCoins,
  coinsToCents,
  convertCoinsToUSD,
  convertCoinsToCents,
  getCoinsPerDollar,
  COINS_PER_DOLLAR,
  COIN_TO_USD_RATE,
};
