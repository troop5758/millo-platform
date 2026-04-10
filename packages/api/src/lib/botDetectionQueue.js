'use strict';
/**
 * Bot detection / enforcement queue — BullMQ. Jobs: risk_score_update, captcha_challenge, shadow_ban, permanent_ban.
 * Consumed by botDetectionWorker. https://milloapp.com
 */
const { Queue } = require('bullmq');

const QUEUE_NAME = 'bot-detection';

let _queue = null;

function getConnection() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
  };
}

function getBotDetectionQueue() {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return _queue;
}

/**
 * Enqueue an enforcement job.
 * @param {string} jobType - 'enforce' | 'risk_score_update' | 'captcha_challenge' | 'shadow_ban' | 'permanent_ban'
 * @param {Object} data - { userId, reason?, expiresAt? (shadow_ban), ... }
 * @param {Object} [opts] - BullMQ job options (delay, attempts, etc.)
 */
async function addBotDetectionJob(jobType, data, opts = {}) {
  const q = getBotDetectionQueue();
  return q.add(jobType, data, {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
    ...opts,
  });
}

module.exports = { getBotDetectionQueue, addBotDetectionJob, QUEUE_NAME };
