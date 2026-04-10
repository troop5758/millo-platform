/**
 * BullMQ queues. https://milloapp.com
 */
const { Queue } = require('bullmq');

const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI;
const connection = redisUrl
  ? { url: redisUrl }
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    };

const trustDecayQueue = new Queue('trust-decay', { connection });
const payoutRetryQueue = new Queue('payout-retry', { connection });
const paymentDeadlineQueue = new Queue('payment-deadline', { connection });
const scheduledStreamsQueue = new Queue('scheduled-streams', { connection });
const streamReminderQueue = new Queue('stream-reminder', { connection });
const liveEventsQueue = new Queue('live-events', { connection });
const dmTimeoutQueue = new Queue('dm-timeout', { connection });
const fraudCheckQueue = new Queue('fraud-check', { connection });
const trackingSupportQueue = new Queue('tracking-support', { connection });
const compositionQueue = new Queue('composition', { connection });
const trendingSoundsQueue = new Queue('trending-sounds', { connection });
const earlyViralDetectionQueue = new Queue('early-viral-detection', { connection });
const clusterPropagationQueue = new Queue('cluster-propagation', { connection });
const emailQueue = new Queue('email', { connection });

module.exports = {
  connection,
  trustDecayQueue,
  payoutRetryQueue,
  paymentDeadlineQueue,
  scheduledStreamsQueue,
  streamReminderQueue,
  liveEventsQueue,
  dmTimeoutQueue,
  fraudCheckQueue,
  trackingSupportQueue,
  compositionQueue,
  trendingSoundsQueue,
  earlyViralDetectionQueue,
  clusterPropagationQueue,
  emailQueue,
};
