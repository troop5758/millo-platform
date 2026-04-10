/**
 * Real-time auction — select winning ad from candidates by bid/score.
 * https://milloapp.com
 */
function runAuction(candidates) {
  if (!candidates || candidates.length === 0) return null;
  const withBid = candidates.map((c) => ({
    ...c,
    _bid: Number(c.bidCents) || 0,
  }));
  withBid.sort((a, b) => b._bid - a._bid);
  return withBid[0];
}

module.exports = { runAuction };
