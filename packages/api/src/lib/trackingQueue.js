'use strict';
/**
 * Tracking support queue — enqueue ticket tracking verification (AfterShip).
 * Jobs processed by @millo/workers trackingSupport.worker.
 * https://milloapp.com
 */
const { Queue } = require('bullmq');

let _queue = null;

function getTrackingSupportQueue() {
  if (!_queue) {
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    };
    _queue = new Queue('tracking-support', { connection });
  }
  return _queue;
}

module.exports = { getTrackingSupportQueue };
