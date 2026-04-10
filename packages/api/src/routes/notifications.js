/**
 * Notifications API — in-app list/mark read; email send stub; push payload. https://milloapp.com
 */
const notifications = require('@millo/notifications');
const { sendCustomerEmail } = require('../lib/customerEmail');

function getRequestUser(req) {
  if (req.user && req.user._id) return req.user;
  // Header-based auth is only permitted outside production (local / staging dev tools).
  if (process.env.NODE_ENV === 'production') return null;
  const id = req.headers['x-user-id'];
  if (!id) return null;
  return { _id: id };
}

async function notificationsRoutes(app) {
  // In-app: list
  app.get('/notifications', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const list = await notifications.listForUser(user._id, {
      limit: req.query?.limit,
      unreadOnly: req.query?.unreadOnly === 'true',
    });
    return reply.send(list);
  });

  // In-app: unread count (e.g. dashboard badge)
  app.get('/notifications/unread-count', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const count = await notifications.getUnreadCount(user._id);
    return reply.send({ count });
  });

  // In-app: mark read
  app.post('/notifications/:id/read', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const doc = await notifications.markRead(req.params.id, user._id);
    if (!doc) return reply.status(404).send({ error: 'NOT_FOUND' });
    return reply.send(doc);
  });

  // Email send — admin/staff only; validates required fields before dispatch
  app.post('/notifications/send-email', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!['admin', 'staff', 'superadmin'].includes(user.role)) {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    const { to, subject, title, body, ctaUrl, ctaText, variant } = req.body || {};
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return reply.status(400).send({ error: 'INVALID_TO', message: 'to must be a valid email address' });
    }
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return reply.status(400).send({ error: 'BODY_REQUIRED', message: 'body is required' });
    }
    const result = await sendCustomerEmail({
      template: 'admin_send_email',
      to: to.toLowerCase().trim(),
      subject: (subject || title || 'Notification').slice(0, 200),
      title,
      body: body.slice(0, 5000),
      ctaUrl,
      ctaText,
      variant,
      userId: user._id,
    });
    if (result && result.skipped) {
      return reply.status(503).send({
        error: 'EMAIL_NOT_CAPABLE',
        message: result.reason === 'EMAIL_CONTROL_PLANE_DISABLED'
          ? 'Email delivery is disabled by control-plane (EMAIL_PROVIDER / production truth).'
          : 'Real email delivery is disabled (capabilities.notifications.email is false).',
        reason: result.reason,
        mode: result.mode,
      });
    }
    if (!result || !result.ok) {
      return reply.status(502).send(result);
    }
    return reply.send(result);
  });

  // Push payload builder (for testing)
  app.get('/notifications/push-payload', async (req, reply) => {
    const payload = notifications.buildPushPayload({
      title: req.query?.title || 'Millo',
      body: req.query?.body || '',
      data: {},
    });
    return reply.send(payload);
  });

  /* ── Register push token (Expo / FCM / APNs) — Phase 3: also store in user_devices ── */
  app.post('/notifications/push-token', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { token, platform } = req.body || {};
    if (!token) return reply.status(400).send({ error: 'TOKEN_REQUIRED' });
    const db = require('@millo/database');
    const plat = ['expo', 'fcm', 'apns'].includes(String(platform || 'expo').toLowerCase()) ? String(platform).toLowerCase() : 'expo';
    await db.User.updateOne(
      { _id: user._id },
      { $addToSet: { pushTokens: { token, platform: plat, updatedAt: new Date() } } }
    ).catch((e) => req.log.warn({ e, userId: String(user._id) }, 'Failed to register push token'));
    await db.UserDevice.findOneAndUpdate(
      { userId: user._id, deviceToken: token },
      { $set: { userId: user._id, deviceToken: token, platform: plat, lastSeenAt: new Date() } },
      { upsert: true }
    ).catch((e) => req.log.warn({ e }, 'Failed to upsert UserDevice'));
    return reply.send({ ok: true });
  });

  /* ── Unregister push token (on logout) — Phase 3: also remove from user_devices ── */
  app.delete('/notifications/push-token', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { token } = req.body || {};
    if (!token) return reply.status(400).send({ error: 'TOKEN_REQUIRED' });
    const db = require('@millo/database');
    await Promise.all([
      db.User.updateOne({ _id: user._id }, { $pull: { pushTokens: { token } } }),
      db.UserDevice.deleteOne({ userId: user._id, deviceToken: token }),
    ]).catch((e) => req.log.warn({ e, userId: String(user._id) }, 'Failed to unregister push token'));
    return reply.send({ ok: true });
  });

  /* ── Send notification (push + in-app) — Phase 3 ── */
  app.post('/notifications/send', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { userId: targetUserId, title, body, data } = req.body || {};
    if (!title && !body) return reply.status(400).send({ error: 'TITLE_OR_BODY_REQUIRED' });
    const db = require('@millo/database');
    const notifyUser = require('../lib/notifyUser');
    const isAdminOrStaff = ['admin', 'staff', 'superadmin'].includes(user.role);
    const recipientId = targetUserId ? targetUserId : user._id;
    if (targetUserId && !isAdminOrStaff) return reply.status(403).send({ error: 'FORBIDDEN' });
    if (targetUserId) {
      const exists = await db.User.findById(recipientId).select('_id').lean();
      if (!exists) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    }
    const doc = await notifyUser(recipientId, {
      type: data?.type || 'admin_notification',
      title: title || 'Notification',
      body: body || '',
      meta: data || {},
    });
    return reply.send({ ok: true, notificationId: doc?._id });
  });
}

module.exports = { notificationsRoutes };
