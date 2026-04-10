'use strict';
/**
 * Customer email outbox — BullMQ queue `email`, job name `send`.
 * PATCH 17 — required producer contract:
 *   await emailQueue.add('send', { to, template, data });
 * Use `enqueueEmailSend` for retries/backoff defaults; `emailQueue` getter exposes the same Queue.
 * Consumer: packages/workers/src/email.worker.js
 * Set EMAIL_USE_QUEUE=false (via shouldEnqueueCustomerEmail) to send synchronously (not recommended).
 * https://milloapp.com
 */
const { Queue } = require('bullmq');

let _queue = null;

function getEmailQueueConnection() {
  const url = process.env.REDIS_URL || process.env.REDIS_URI;
  if (url) return { url };
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

function getEmailQueue() {
  if (!_queue) {
    _queue = new Queue('email', { connection: getEmailQueueConnection() });
  }
  return _queue;
}

/**
 * @param {{ to: string, template?: string, data?: object }} payload
 * @returns {Promise<import('bullmq').Job>}
 */
async function enqueueEmailSend(payload) {
  const emailQueue = getEmailQueue();
  const to = payload?.to;
  const template = payload?.template || 'transactional';
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  /* PATCH 17 — email queue (required) */
  return emailQueue.add(
    'send',
    { to, template, data },
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 500,
      removeOnFail: 2000,
    }
  );
}

function shouldEnqueueCustomerEmail() {
  if (process.env.EMAIL_USE_QUEUE === 'false') return false;
  return !!(process.env.REDIS_URL || process.env.REDIS_URI || process.env.REDIS_HOST);
}

module.exports = {
  getEmailQueue,
  getEmailQueueConnection,
  enqueueEmailSend,
  shouldEnqueueCustomerEmail,
};

Object.defineProperty(module.exports, 'emailQueue', {
  enumerable: true,
  get() {
    return getEmailQueue();
  },
});
