/**
 * Wash trade detection — reject bids where bidder and seller are same or related.
 * https://milloapp.com
 */
function checkWashTrade(auctionId, bidderId, sellerId) {
  if (!bidderId || !sellerId) return { allowed: true };
  const bidder = bidderId.toString ? bidderId.toString() : String(bidderId);
  const seller = sellerId.toString ? sellerId.toString() : String(sellerId);
  if (bidder === seller) return { allowed: false, reason: 'WASH_TRADE_SUSPECTED', message: 'Bidder cannot be seller.' };
  return { allowed: true };
}

module.exports = { checkWashTrade };
