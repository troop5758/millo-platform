'use strict';
/**
 * Commerce Integrity — Auction enforcement: if winner is unpaid after `auction.deadline`
 * (set at end-of-auction / reassign; window defaults to 24h via `AUCTION_PAYMENT_WINDOW_HOURS`),
 * run `reassignWinner()` or mark `defaulted`, then `penalizeUser()` (Penalty + FinancialAuditLog).
 * API loop: `packages/api/src/workers/auctionDeadlineWorker.js`.
 *
 * https://milloapp.com
 */
const db = require('@millo/database');
const { reassignWinner } = require('@millo/economy');

/**
 * @param {object} auction — plain or lean auction doc
 * @returns {boolean}
 */
/** True when payment window ended and winner has not paid (auction.expired && !paid). */
function isAuctionExpiredAndUnpaid(auction) {
  const paidAt = auction.paidAt ?? auction.meta?.paidAt;
  if (paidAt) return false;
  if (auction.status !== 'awaiting_payment') return false;
  if (!auction.deadline) return false;
  return new Date(auction.deadline) < new Date();
}

/**
 * @param {object} auction
 * @returns {Promise<{ reassigned: boolean, reason?: string, new_winner?: import('mongoose').Types.ObjectId }>}
 */
async function reassignAuction(auction) {
  return reassignWinner(auction);
}

/**
 * @param {import('mongoose').Types.ObjectId|string|null|undefined} winnerId
 * @param {object} auction
 * @param {string} reason
 * @param {object} [extraMeta]
 */
async function penalizeUser(winnerId, auction, reason, extraMeta = {}) {
  if (!winnerId) return;
  await db.Penalty.create({
    type: 'commerce_violation',
    userId: winnerId,
    reason,
    refType: 'auction',
    refId: String(auction._id),
    meta: {
      deadline: auction.deadline,
      ...extraMeta,
    },
  }).catch(() => {});
}

/**
 * Single auction: if payment window expired and unpaid → `reassignWinner` then penalize prior winner (or default + penalize).
 * @param {object} auction — lean/plain auction doc
 * @returns {Promise<{ acted: boolean, outcome: 'skipped'|'reassigned'|'defaulted', result?: object }>}
 */
async function processExpiredUnpaidAuction(auction) {
  if (!isAuctionExpiredAndUnpaid(auction)) {
    return { acted: false, outcome: 'skipped' };
  }
  const priorWinnerId = auction.winnerId ?? auction.currentBidderId;
  const result = await reassignAuction(auction);
  if (result.reassigned) {
    await penalizeUser(priorWinnerId, auction, 'auction_payment_unpaid_reassigned', {
      newWinnerId: result.new_winner ? String(result.new_winner) : null,
    });
    await db.FinancialAuditLog.create({
      action: 'auction_winner_reassigned',
      amountCents: auction.winningBidCents ?? auction.currentBidCents ?? 0,
      refType: 'auction',
      refId: String(auction._id),
      actorId: null,
      meta: {
        previousWinnerId: priorWinnerId ? String(priorWinnerId) : null,
        newWinnerId: result.new_winner ? String(result.new_winner) : null,
        reason: result.reason,
      },
    }).catch(() => {});
    return { acted: true, outcome: 'reassigned', result };
  }
  await db.Auction.updateOne(
    { _id: auction._id },
    { $set: { status: 'defaulted', updatedAt: new Date() } }
  );

  await db.FinancialAuditLog.create({
    action: 'auction_defaulted',
    amountCents: auction.winningBidCents ?? auction.currentBidCents ?? 0,
    refType: 'auction',
    refId: String(auction._id),
    actorId: null,
    meta: {
      winnerId: priorWinnerId ? String(priorWinnerId) : null,
      creatorId: auction.creatorId ? String(auction.creatorId) : null,
      deadline: auction.deadline,
      reason: result.reason,
    },
  }).catch(() => {});

  await penalizeUser(priorWinnerId, auction, 'auction_payment_defaulted', {
    winningBidCents: auction.winningBidCents ?? auction.currentBidCents,
  });
  return { acted: true, outcome: 'defaulted', result };
}

/**
 * @returns {Promise<{ processed: number, skippedNotDue: number, defaulted: number, reassigned: number }>}
 */
async function runAuctionPaymentEnforcement() {
  const auctions = await db.Auction.find({
    status: 'awaiting_payment',
    deadline: { $lt: new Date() },
  }).lean();

  let defaulted = 0;
  let reassigned = 0;
  let skippedNotDue = 0;

  for (const row of auctions) {
    const auction = { ...row };
    const one = await processExpiredUnpaidAuction(auction);
    if (!one.acted) {
      skippedNotDue++;
      continue;
    }
    if (one.outcome === 'reassigned') reassigned += 1;
    else if (one.outcome === 'defaulted') defaulted += 1;
  }

  return {
    processed: auctions.length,
    skippedNotDue,
    defaulted,
    reassigned,
  };
}

module.exports = {
  runAuctionPaymentEnforcement,
  processExpiredUnpaidAuction,
  isPaymentExpired: isAuctionExpiredAndUnpaid,
  isAuctionExpiredAndUnpaid,
  reassignAuction,
  penalizeUser,
};
