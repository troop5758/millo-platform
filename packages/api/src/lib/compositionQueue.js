'use strict';
/**
 * Composition queue — enqueue video+audio FFmpeg jobs.
 * Processed by @millo/workers composition.worker.
 * https://milloapp.com
 */
const { Queue } = require('bullmq');

let _queue = null;

function getCompositionQueue() {
  if (!_queue) {
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    };
    _queue = new Queue('composition', { connection });
  }
  return _queue;
}

module.exports = { getCompositionQueue };
