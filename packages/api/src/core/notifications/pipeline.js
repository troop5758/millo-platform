'use strict';
/**
 * Notification pipeline — BullMQ `notifications` queue, job name `send`, delivery rows in NotificationLog.
 * Worker: packages/workers/src/notifications.worker.js
 * Redis: same connection contract as customer email queue (`lib/emailQueue`).
 * https://milloapp.com
 */

const { Queue } = require('bullmq');
const db = require('@millo/database');
const { getEmailQueueConnection } = require('../../lib/emailQueue');

const QUEUE_NAME = 'notifications';

function shouldEnqueueNotificationPipeline() {
  if (process.env.NOTIFICATION_USE_QUEUE === 'false') return false;
  return !!(process.env.REDIS_URL || process.env.REDIS_URI || process.env.REDIS_HOST);
}

let _queue = null;

function getNotificationPipelineQueue() {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: getEmailQueueConnection() });
  }
  return _queue;
}

/** @typedef {'email'|'push'|'in_app'|'sms'} NotificationPipelineType */

/**
 * @param {Record<string, unknown>} msg
 * @returns {{
 *   userId: import('mongoose').Types.ObjectId,
 *   type: NotificationPipelineType,
 *   provider: string,
 *   error?: string,
 *   templateKey?: string,
 *   to?: string,
 *   subject?: string,
 *   meta: Record<string, unknown>,
 *   jobPayload: Record<string, unknown>,
 * }}
 */
function normalizePipelineMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    const err = new Error('NOTIFICATION_MESSAGE_REQUIRED');
    err.code = 'NOTIFICATION_MESSAGE_REQUIRED';
    throw err;
  }
  if (msg.userId == null || msg.userId === '') {
    const err = new Error('NOTIFICATION_USER_ID_REQUIRED');
    err.code = 'NOTIFICATION_USER_ID_REQUIRED';
    throw err;
  }
  const rawType = String(msg.type || 'in_app').toLowerCase();
  /** @type {NotificationPipelineType} */
  const type = ['email', 'push', 'in_app', 'sms'].includes(rawType) ? rawType : 'in_app';
  const provider = String(msg.provider || 'unknown').slice(0, 64);
  const userId = new db.mongoose.Types.ObjectId(String(msg.userId));
  const meta = msg.meta && typeof msg.meta === 'object' && !Array.isArray(msg.meta) ? { ...msg.meta } : {};

  const jobPayload = {
    userId: String(msg.userId),
    type,
    provider,
    title: msg.title,
    body: msg.body,
    data: msg.data && typeof msg.data === 'object' ? msg.data : {},
    to: msg.to != null ? String(msg.to).trim().slice(0, 512) : undefined,
    subject: msg.subject != null ? String(msg.subject).trim().slice(0, 512) : undefined,
    templateKey: msg.templateKey != null ? String(msg.templateKey).slice(0, 128) : undefined,
    template: msg.template != null ? String(msg.template).slice(0, 128) : undefined,
    ctaUrl: msg.ctaUrl,
    ctaText: msg.ctaText,
    inAppType: msg.inAppType != null ? String(msg.inAppType).slice(0, 64) : undefined,
  };

  return {
    userId,
    type,
    provider,
    error: msg.error != null ? String(msg.error).slice(0, 2000) : undefined,
    templateKey: jobPayload.templateKey,
    to: jobPayload.to,
    subject: jobPayload.subject,
    meta,
    jobPayload,
  };
}

/**
 * @param {Record<string, unknown>} msg — userId, type, provider, status implied queued; optional to, subject, templateKey, title, body, data, error, meta
 * @returns {Promise<import('bullmq').Job>}
 */
async function sendNotification(msg) {
  if (!shouldEnqueueNotificationPipeline()) {
    const err = new Error('NOTIFICATION_QUEUE_REDIS_REQUIRED');
    err.code = 'NOTIFICATION_QUEUE_REDIS_REQUIRED';
    throw err;
  }

  const normalized = normalizePipelineMessage(msg);
  const queue = getNotificationPipelineQueue();
  const job = await queue.add('send', normalized.jobPayload, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 500,
    removeOnFail: 2000,
  });

  const logDoc = {
    userId: normalized.userId,
    type: normalized.type,
    provider: normalized.provider,
    status: 'queued',
    templateKey: normalized.templateKey,
    to: normalized.to,
    subject: normalized.subject,
    meta: {
      ...normalized.meta,
      bullmqJobId: String(job.id),
    },
    createdAt: new Date(),
  };
  if (normalized.error) logDoc.error = normalized.error;

  await db.NotificationLog.create(logDoc);
  return job;
}

module.exports = {
  QUEUE_NAME,
  getNotificationPipelineQueue,
  shouldEnqueueNotificationPipeline,
  normalizePipelineMessage,
  sendNotification,
};
