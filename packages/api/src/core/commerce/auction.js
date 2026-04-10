'use strict';
/**
 * Commerce auction worker contract — expired + unpaid → `reassignWinner` + `penalizeUser` (+ audits in worker).
 * Implementation: `packages/workers/src/auction.worker.js`.
 * https://milloapp.com
 */

const path = require('path');
const { reassignWinner } = require('@millo/economy');

const auctionWorker = require(path.join(__dirname, '..', '..', '..', '..', 'workers', 'src', 'auction.worker.js'));

/**
 * Same as economy `reassignWinner(auction)` (next bidder or no-op before default path).
 * @param {object} auction
 */
async function reassignWinnerForAuction(auction) {
  return reassignWinner(auction);
}

/**
 * @param {import('mongoose').Types.ObjectId|string|null|undefined} winnerId
 * @param {object} auction
 * @param {string} reason
 * @param {object} [extraMeta]
 */
async function penalizeUser(winnerId, auction, reason, extraMeta) {
  return auctionWorker.penalizeUser(winnerId, auction, reason, extraMeta);
}

/**
 * `auction.expired && !paid` style check (deadline passed, awaiting_payment, no paidAt).
 * @param {object} auction
 * @returns {boolean}
 */
function isAuctionExpiredAndUnpaid(auction) {
  return auctionWorker.isAuctionExpiredAndUnpaid(auction);
}

/**
 * Single-auction enforcement: if expired and unpaid, reassign then penalize (or default + penalize).
 * @param {object} auction
 * @returns {Promise<{ acted: boolean, outcome: 'skipped'|'reassigned'|'defaulted', result?: object }>}
 */
async function processExpiredUnpaidAuction(auction) {
  return auctionWorker.processExpiredUnpaidAuction(auction);
}

/**
 * Product alias — same as `processExpiredUnpaidAuction`.
 * @param {object} auction
 */
async function enforceUnpaidExpiredAuction(auction) {
  return processExpiredUnpaidAuction(auction);
}

/**
 * Optional sketch-style guard: run reassign + penalize only when due (full audits inside worker).
 * @param {object} auction
 */
async function ifExpiredUnpaidThenReassignAndPenalize(auction) {
  if (!isAuctionExpiredAndUnpaid(auction)) {
    return { acted: false, outcome: 'skipped' };
  }
  return processExpiredUnpaidAuction(auction);
}

/**
 * Batch: all overdue awaiting_payment auctions.
 * @returns {Promise<{ processed: number, skippedNotDue: number, defaulted: number, reassigned: number }>}
 */
async function runAuctionPaymentEnforcement() {
  return auctionWorker.runAuctionPaymentEnforcement();
}

module.exports = {
  reassignWinner: reassignWinnerForAuction,
  penalizeUser,
  isAuctionExpiredAndUnpaid,
  processExpiredUnpaidAuction,
  enforceUnpaidExpiredAuction,
  ifExpiredUnpaidThenReassignAndPenalize,
  runAuctionPaymentEnforcement,
  reassignAuction: auctionWorker.reassignAuction,
};
