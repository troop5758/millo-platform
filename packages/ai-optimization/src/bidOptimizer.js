/**
 * Bid optimizer — shadow mode. Suggests winner/bids; never applies to ads delivery.
 * https://milloapp.com
 */
const config = require('./config');
const { logShadowOutput } = require('./shadowLog');

/**
 * Returns suggested winner and optional bid adjustments with explanation. Does NOT call ads.runAuction or ads.deliver.
 * When kill-switch off, returns disabled.
 */
function suggestBid(candidates, context = {}) {
  if (!config.getAiOptimizationEnabled()) {
    return {
      applied: false,
      shadowMode: true,
      disabled: true,
      suggestedWinner: null,
      suggestedBids: [],
      explanation: { reason: 'AI_OPTIMIZATION_DISABLED', message: 'Kill-switch off; no suggestion applied.' },
    };
  }
  if (!candidates || candidates.length === 0) {
    return {
      applied: false,
      shadowMode: true,
      suggestedWinner: null,
      suggestedBids: [],
      explanation: { reason: 'EMPTY_INPUT', message: 'No candidates.' },
    };
  }
  const withBid = candidates.map((c) => ({
    ...c,
    _bid: Number(c.bidCents) || 0,
  }));
  withBid.sort((a, b) => b._bid - a._bid);
  const suggestedWinner = withBid[0] || null;
  const suggestedBids = withBid.map((c) => ({ id: c.id || c._id, bidCents: c._bid }));
  const explanation = {
    reason: 'AI_BID_SUGGESTION',
    shadowMode: true,
    applied: false,
    candidateCount: candidates.length,
    suggestedWinnerId: suggestedWinner ? (suggestedWinner.id || suggestedWinner._id) : null,
    message: 'Suggestion only; not applied to ads delivery.',
  };
  const result = { applied: false, shadowMode: true, suggestedWinner, suggestedBids, explanation };
  logShadowOutput('bid', { applied: false, shadowMode: true, candidateCount: candidates.length, explanation });
  return result;
}

module.exports = { suggestBid };
