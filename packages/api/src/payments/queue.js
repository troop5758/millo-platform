'use strict';
/**
 * BullMQ queue for optional async payment webhook ingestion.
 * Requires Redis. Jobs are only produced if handlers enqueue (see env in payments module).
 * https://milloapp.com
 */
const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');

function createConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    return new IORedis(url, { maxRetriesPerRequest: null });
  }
  return new IORedis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
  });
}

const connection = createConnection();

const webhookQueue = new Queue('payments-webhooks', { connection });
const webhookEvents = new QueueEvents('payments-webhooks', { connection });

function createWorker(processor, opts = {}) {
  return new Worker('payments-webhooks', processor, {
    connection,
    concurrency: opts.concurrency != null ? opts.concurrency : 10,
  });
}

module.exports = {
  connection,
  webhookQueue,
  webhookEvents,
  createWorker,
};
