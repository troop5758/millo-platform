'use strict';
/**
 * Notifications pipeline worker — queue `notifications`, job `send`.
 * Updates NotificationLog row keyed by meta.bullmqJobId (set by packages/api/src/core/notifications/pipeline.js).
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const { connection } = require('./queues');
const db = require('@millo/database');
const inApp = require('@millo/notifications/src/inApp');
const { sendEmail } = require('@millo/notifications/src/sendEmail');
const path = require('path');
const { getControlPlaneModes } = require(path.join(__dirname, '..', '..', 'api', 'src', 'core', 'control-plane'));

async function patchLogByJobId(jobId, patch) {
  await db.NotificationLog.findOneAndUpdate(
    { 'meta.bullmqJobId': String(jobId) },
    { $set: patch },
    { new: true }
  ).catch(() => null);
}

const worker = new Worker(
  'notifications',
  async (job) => {
    if (job.name !== 'send') {
      throw new Error(`Unknown notifications job: ${job.name}`);
    }
    const d = job.data || {};
    const uid = d.userId;

    try {
      if (d.type === 'email') {
        const result = await sendEmail({
          to: d.to,
          subject: d.subject || d.title || 'Notification',
          title: d.title,
          body: d.body || '',
          ctaUrl: d.ctaUrl,
          ctaText: d.ctaText,
          userId: uid,
          templateKey: d.templateKey || d.template,
          skipNotificationLog: true,
        });
        await patchLogByJobId(job.id, {
          status: result.ok ? 'sent' : 'failed',
          error: result.ok ? null : (result.error || 'EMAIL_SEND_FAILED'),
          provider: result.provider || undefined,
          providerMessageId: result.messageId || result.providerMessageId || undefined,
          providerResponse:
            result && typeof result === 'object'
              ? { ok: result.ok, error: result.error, messageId: result.messageId }
              : undefined,
          deliveredAt: result.ok ? new Date() : undefined,
        });
        if (!result.ok) throw new Error(result.error || 'EMAIL_SEND_FAILED');
        return result;
      }

      if (d.type === 'push') {
        const pushMode = (() => {
          try { return getControlPlaneModes().push; } catch { return 'unknown'; }
        })();
        if (pushMode !== 'LIVE') {
          const err = new Error(`push unavailable (mode=${pushMode})`);
          await patchLogByJobId(job.id, {
            status: 'failed',
            error: err.message,
            providerResponse: { ok: false, mode: pushMode, code: 'SYSTEM_CAPABILITY_DISABLED' },
          });
          throw err;
        }
        const { sendPushToUser } = require('@millo/notifications/src/push');
        const user = await db.User.findById(uid).select('pushTokens').lean();
        const devices = await db.UserDevice.find({ userId: uid }).select('deviceToken platform').lean();
        const tokens = [...(user?.pushTokens || [])];
        for (const dev of devices || []) {
          if (dev.deviceToken && !tokens.some((t) => t.token === dev.deviceToken)) {
            tokens.push({ token: dev.deviceToken, platform: dev.platform || 'expo' });
          }
        }
        await sendPushToUser(tokens, {
          title: d.title || 'Millo',
          body: d.body || '',
          data: { ...(d.data || {}) },
        });
        await patchLogByJobId(job.id, {
          status: 'sent',
          error: null,
          deliveredAt: new Date(),
        });
        return { ok: true };
      }

      if (d.type === 'in_app') {
        const notifType = d.inAppType || d.templateKey || 'notification';
        await inApp.create(uid, notifType, {
          title: d.title,
          body: d.body,
          ...(d.data && typeof d.data === 'object' ? d.data : {}),
        });
        await patchLogByJobId(job.id, {
          status: 'sent',
          error: null,
          deliveredAt: new Date(),
        });
        return { ok: true };
      }

      if (d.type === 'sms') {
        const err = new Error('SMS_NOT_IMPLEMENTED');
        await patchLogByJobId(job.id, {
          status: 'failed',
          error: err.message,
        });
        throw err;
      }

      const err = new Error(`UNKNOWN_NOTIFICATION_TYPE:${d.type}`);
      await patchLogByJobId(job.id, {
        status: 'failed',
        error: err.message,
      });
      throw err;
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 2000);
      await patchLogByJobId(job.id, {
        status: 'failed',
        error: msg,
      });
      throw e;
    }
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[notifications-worker] Job failed', job?.id, err?.message || err);
});

module.exports = { worker };
