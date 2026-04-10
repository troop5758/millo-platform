/**
 * BullMQ decay worker — trust decay. Audit logging via level-trust.
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const { connection } = require('./queues');

async function processDecay(job) {
  const { userId, amount } = job.data;
  if (!userId || amount >= 0) {
    throw new Error('Invalid decay job: userId required, amount must be negative');
  }
  const levelTrust = require('@millo/level-trust');
  await levelTrust.addTrust(userId, amount, 'decay');
}

const worker = new Worker(
  'trust-decay',
  async (job) => {
    await processDecay(job);
    return { ok: true, userId: job.data.userId };
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[decay-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, processDecay };
