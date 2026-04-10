'use strict';
/**
 * Email queue worker — job name `send`, data: { to, template, data }.
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const { connection } = require('./queues');
const { sendEmail } = require('@millo/notifications');

const worker = new Worker(
  'email',
  async (job) => {
    if (job.name !== 'send') {
      throw new Error(`Unknown email job: ${job.name}`);
    }
    const { to, template: _template, data = {} } = job.data || {};
    if (!to || typeof to !== 'string') {
      throw new Error('EMAIL_JOB_MISSING_TO');
    }
    const d = typeof data === 'object' && data ? data : {};
    return sendEmail({
      to: String(to).trim(),
      subject: d.subject,
      title: d.title,
      body: d.body,
      ctaUrl: d.ctaUrl,
      ctaText: d.ctaText,
      variant: d.variant,
      replyTo: d.replyTo,
      userId: d.userId || undefined,
      templateKey: _template || 'transactional',
    });
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[email-worker] Job failed', job?.id, err?.message || err);
});

module.exports = { worker };
