'use strict';
/**
 * notifyUser — create a DB notification, push it via WebSocket AND send a device push.
 * Use this everywhere instead of db.Notification.create() directly.
 * https://milloapp.com
 */
const db           = require('@millo/database');
const userSockets  = require('./userSockets');
const { sendPushToUser } = require('@millo/notifications/src/push');
const kafka = require('../services/kafkaEventBus');
const { getControlPlaneModes } = require('../core/control-plane');
const { sendNotification, shouldEnqueueNotificationPipeline } = require('../core/notifications');

/**
 * @param {string|ObjectId} userId
 * @param {{ type: string, title?: string, body?: string, meta?: object, url?: string }} opts
 */
async function notifyUser(userId, { type, title, body, meta = {}, url } = {}) {
  // 1. Persist to DB
  const doc = await db.Notification.create({
    userId,
    type,
    title:   title || type,
    body:    body  || '',
    payload: { ...meta, ...(url ? { url } : {}) },
    read:    false,
  }).catch(() => null);

  // 2. Real-time via WebSocket (instant if user is online)
  if (doc) {
    userSockets.push(String(userId), {
      type: 'notification',
      data: doc.toObject(),
    });
    kafka.publish(kafka.TOPICS.NOTIFICATIONS, {
      event: 'notification.created',
      userId: String(userId),
      notificationId: String(doc._id),
      type,
    }).catch(() => {});
  }

  // 3. Device push notification (User.pushTokens + UserDevice / user_devices)
  try {
    // Mandatory core: push must be LIVE in control-plane to deliver device pushes.
    const pushMode = (() => {
      try { return getControlPlaneModes().push; } catch { return 'unknown'; }
    })();
    if (pushMode !== 'LIVE') return doc;

    // Production posture: prefer async pipeline (NotificationLog + retries) when Redis is available.
    // Fallback: best-effort immediate push in-process if pipeline cannot enqueue.
    if (shouldEnqueueNotificationPipeline()) {
      try {
        await sendNotification({
          userId: String(userId),
          type: 'push',
          provider: 'push_pipeline',
          title: title || 'Millo',
          body: body || '',
          data: { type, ...(url ? { url } : {}), ...meta },
          templateKey: type,
          meta: {
            notificationId: doc?._id ? String(doc._id) : undefined,
            source: 'notifyUser',
          },
        });
        return doc;
      } catch {
        /* fall through to direct send */
      }
    }

    const [user, devices] = await Promise.all([
      db.User.findById(userId).select('pushTokens').lean(),
      db.UserDevice?.find({ userId }).select('deviceToken platform').lean().catch(() => []),
    ]);
    const tokens = [...(user?.pushTokens || [])];
    if (Array.isArray(devices) && devices.length) {
      for (const d of devices) {
        if (d.deviceToken && !tokens.some((t) => t.token === d.deviceToken)) {
          tokens.push({ token: d.deviceToken, platform: d.platform || 'expo' });
        }
      }
    }
    if (tokens.length) {
      await db.NotificationLog.create({
        userId,
        type: 'push',
        status: 'queued',
        provider: 'push_direct_api',
        templateKey: String(type || 'notification').slice(0, 128),
        meta: {
          notificationId: doc?._id ? String(doc._id) : undefined,
          tokenCount: tokens.length,
          source: 'notifyUser',
        },
        createdAt: new Date(),
      }).catch(() => null);
      await sendPushToUser(tokens, {
        title: title || 'Millo',
        body:  body  || '',
        data:  { type, ...(url ? { url } : {}), ...meta },
      });
      await db.NotificationLog.create({
        userId,
        type: 'push',
        status: 'sent',
        provider: 'push_direct_api',
        templateKey: String(type || 'notification').slice(0, 128),
        deliveredAt: new Date(),
        meta: {
          notificationId: doc?._id ? String(doc._id) : undefined,
          tokenCount: tokens.length,
          source: 'notifyUser',
        },
        createdAt: new Date(),
      }).catch(() => null);
    }
  } catch (e) {
    await db.NotificationLog.create({
      userId,
      type: 'push',
      status: 'failed',
      provider: 'push_direct_api',
      templateKey: String(type || 'notification').slice(0, 128),
      error: String(e?.message || e).slice(0, 2000),
      meta: {
        notificationId: doc?._id ? String(doc._id) : undefined,
        source: 'notifyUser',
      },
      createdAt: new Date(),
    }).catch(() => null);
    // Non-fatal — WS delivery already done
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[notifyUser] push delivery failed:', e.message);
    }
  }

  return doc;
}

module.exports = { notifyUser };
