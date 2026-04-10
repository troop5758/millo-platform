/**
 * Auto reassignment — when winner does not pay by deadline, reassign auction to next bidder.
 * Payment window: `AUCTION_PAYMENT_WINDOW_HOURS` (default 24). Stored on each auction as `deadline`.
 * `AUCTION_PAYMENT_DEADLINE_MINUTES` remains as minutes override if set (else derived from hours).
 * https://milloapp.com
 */
const db = require('@millo/database');

const PAYMENT_WINDOW_HOURS = Math.max(1, Number(process.env.AUCTION_PAYMENT_WINDOW_HOURS) || 24);
const LEGACY_DEADLINE_MINUTES = Number(process.env.AUCTION_PAYMENT_DEADLINE_MINUTES);
const DEADLINE_MINUTES = Number.isFinite(LEGACY_DEADLINE_MINUTES) && LEGACY_DEADLINE_MINUTES > 0
  ? LEGACY_DEADLINE_MINUTES
  : PAYMENT_WINDOW_HOURS * 60;

const REASSIGN_DEADLINE_HOURS = PAYMENT_WINDOW_HOURS;

function getPaymentDeadlineMinutes() {
  return DEADLINE_MINUTES;
}

function getPaymentWindowHours() {
  return PAYMENT_WINDOW_HOURS;
}

/**
 * Check if auction winner payment is overdue. Prefers `auction.deadline` (set at end / reassign); else endsAt + window.
 * paidAt or meta.paidAt indicates payment received.
 */
function isPaymentOverdue(auction) {
  if (!auction?.winnerId) return false;
  const paidAt = auction.paidAt ?? auction.meta?.paidAt;
  if (paidAt) return false;
  const now = new Date();
  if (auction.deadline) {
    return now > new Date(auction.deadline);
  }
  const endsAt = auction.endsAt ? new Date(auction.endsAt) : null;
  if (!endsAt) return false;
  return now > new Date(endsAt.getTime() + DEADLINE_MINUTES * 60 * 1000);
}

/**
 * Reassign auction winner to second-highest bidder when current winner defaults.
 * @param {Object} auction — Auction doc (or plain object with bids, _id)
 * @returns {Promise<{reassigned:boolean, reason?:string, new_winner?:ObjectId}>}
 */
async function reassignWinner(auction) {
  const bids = (auction?.bids || [])
    .filter((b) => b.bidderId && b.amountCents != null)
    .sort((a, b) => (b.amountCents || 0) - (a.amountCents || 0));

  if (bids.length < 2) {
    return { reassigned: false, reason: 'NO_SECOND_BIDDER' };
  }

  const newWinner = bids[1].bidderId;
  const newWinningCents = bids[1].amountCents;

  const updated = await db.Auction.findByIdAndUpdate(
    auction._id,
    {
      $set: {
        winnerId: newWinner,
        winningBidCents: newWinningCents,
        status: 'awaiting_payment',
        deadline: new Date(Date.now() + REASSIGN_DEADLINE_HOURS * 60 * 60 * 1000),
      },
    },
    { new: true }
  );

  return {
    reassigned: true,
    new_winner: newWinner,
    newWinningCents,
    auction: updated,
  };
}

/**
 * Reassign auction if unpaid (used by payment deadline worker).
 * Loads auction, calls reassignWinner; if not reassigned, caller may set defaulted.
 */
async function reassignAuctionIfUnpaid(auctionId, deadlineMinutes) {
  const auction = await db.Auction.findById(auctionId).lean();
  if (!auction) return { reassigned: false, reason: 'AUCTION_NOT_FOUND', deadlineMinutes: deadlineMinutes ?? DEADLINE_MINUTES };
  if (auction.status !== 'awaiting_payment' && auction.status !== 'defaulted') {
    return { reassigned: false, reason: 'INVALID_STATUS', status: auction.status };
  }

  const result = await reassignWinner(auction);
  return { ...result, deadlineMinutes: deadlineMinutes ?? DEADLINE_MINUTES };
}

module.exports = {
  reassignWinner,
  reassignAuctionIfUnpaid,
  getPaymentDeadlineMinutes,
  getPaymentWindowHours,
  isPaymentOverdue,
  REASSIGN_DEADLINE_HOURS,
  PAYMENT_WINDOW_HOURS,
};
