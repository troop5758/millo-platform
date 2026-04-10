/**
 * Payout retry worker — retries failed payouts. https://milloapp.com
 */
const { Worker } = require('bullmq');
const { connection } = require('./queues');
const billing = require('@millo/billing');

const worker = new Worker(
  'payout-retry',
  async (job) => {
    const { payoutId } = job.data;
    const result = await billing.processRetry(payoutId);
    return result;
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[payout-retry-worker] Job failed', job?.id, err.message);
});

module.exports = { worker };
