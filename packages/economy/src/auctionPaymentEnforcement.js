'use strict';
/**
 * Auction payment deadline enforcement — implementation lives in `@millo/workers` (PATCH 15).
 * Re-export keeps `require('@millo/economy').runAuctionPaymentEnforcement` stable for API / tools.
 * https://milloapp.com
 */
const path = require('path');

async function runAuctionPaymentEnforcement() {
  const workerAuction = require(path.join(__dirname, '..', '..', 'workers', 'src', 'auction.worker.js'));
  return workerAuction.runAuctionPaymentEnforcement();
}

module.exports = { runAuctionPaymentEnforcement };
