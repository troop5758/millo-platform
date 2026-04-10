/**
 * Auctions — bid and settle. Ledger integration, wash trade detection.
 * https://milloapp.com
 */
const db = require('@millo/database');
const coins = require('./coins');
const washTrade = require('./washTrade');
const { recordPaymentTransaction } = require('./paymentTransaction');

const auctionStatus = new Map();
const bids = new Map();

function createAuction(sellerId, itemId, reserveCents) {
  const id = `auction_${Date.now()}_${itemId}`;
  auctionStatus.set(id, { sellerId, itemId, reserveCents, status: 'open', winningBidId: null });
  return id;
}

async function placeBid(auctionId, bidderId, amountCents) {
  const a = auctionStatus.get(auctionId);
  if (!a || a.status !== 'open') throw new Error('AUCTION_NOT_OPEN');
  const wt = washTrade.checkWashTrade(auctionId, bidderId, a.sellerId);
  if (!wt.allowed) throw new Error(wt.reason || 'WASH_TRADE_SUSPECTED');
  await coins.debit(bidderId, amountCents, 'auction_bid', auctionId);
  const bidId = `bid_${Date.now()}_${bidderId}`;
  if (!bids.has(auctionId)) bids.set(auctionId, []);
  bids.get(auctionId).push({ bidId, bidderId, amountCents });
  return bidId;
}

async function settleAuction(auctionId, winningBidId) {
  const a = auctionStatus.get(auctionId);
  if (!a || a.status !== 'open') throw new Error('AUCTION_NOT_OPEN');
  const list = bids.get(auctionId) || [];
  const winning = list.find((b) => b.bidId === winningBidId);
  if (!winning) throw new Error('BID_NOT_FOUND');
  if (winning.amountCents < a.reserveCents) throw new Error('RESERVE_NOT_MET');
  a.status = 'settled';
  a.winningBidId = winningBidId;
  await coins.credit(a.sellerId, winning.amountCents, 'auction_settle', auctionId, { winningBidId });
  recordPaymentTransaction({
    type: 'auction_payment',
    grossAmountCents: winning.amountCents,
    platformFeeCents: 0,
    creatorAmountCents: winning.amountCents,
    userId: winning.bidderId,
    creatorId: a.sellerId,
    status: 'completed',
  }).catch(() => {});
  for (const b of list) {
    if (b.bidId !== winningBidId) await coins.credit(b.bidderId, b.amountCents, 'auction_refund', auctionId);
  }
  return { ok: true, sellerId: a.sellerId, amountCents: winning.amountCents };
}

module.exports = { createAuction, placeBid, settleAuction };
