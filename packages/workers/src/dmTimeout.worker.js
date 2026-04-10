/**
 * DM Timeout worker — expire unpaid unlock messages.
 * Finds PaidMessage with status pending and expires_at past; sets status expired.
 * Runs every 10 minutes.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { Worker } = require('bullmq');
const { connection } = require('./queues');

async function enforceDMTimeout() {
  const messages = await db.PaidMessage.find({
    status: 'pending',
    expires_at: { $lt: new Date() },
  });

  for (const m of messages) {
    m.status = 'expired';
    await m.save();
  }

  return { processed: messages.length };
}

const worker = new Worker(
  'dm-timeout',
  async (job) => {
    const result = await enforceDMTimeout();
    return result;
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[dm-timeout-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, enforceDMTimeout };
