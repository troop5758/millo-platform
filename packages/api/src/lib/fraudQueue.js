'use strict';
/**
 * Fraud check queue — enqueue async fraud checks after gift transactions.
 * Uses same Redis as workers; jobs processed by @millo/workers fraudCheck.worker.
 * https://milloapp.com
 */
const { Queue } = require('bullmq');

let _queue = null;

function getFraudCheckQueue() {
  if (!_queue) {
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    };
    _queue = new Queue('fraud-check', { connection });
  }
  return _queue;
}

module.exports = { getFraudCheckQueue };
