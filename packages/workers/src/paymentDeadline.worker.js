/**
 * Payment deadline worker — enforce payment deadline on auctions.
 * Auction winners must pay within 24 hours. Finds auctions with status
 * awaiting_payment and deadline past. Tries reassignment to second bidder;
 * if no second bidder, sets defaulted. Logs to FinancialAuditLog.
 * Runs every hour.
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const { connection } = require('./queues');
const { runAuctionPaymentEnforcement } = require('./auction.worker');

async function enforceDeadlines() {
  return runAuctionPaymentEnforcement();
}

const worker = new Worker(
  'payment-deadline',
  async (job) => {
    const result = await enforceDeadlines();
    return result;
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[payment-deadline-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, enforceDeadlines };
