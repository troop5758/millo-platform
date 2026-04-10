'use strict';
/**
 * Admin / support — device panel (DeviceFingerprint rows per user).
 * GET /admin/devices/:userId — Mongodb-backed; no separate Device collection.
 * Auth: admin or support (Bearer session / JWT via auth middleware → request.user).
 * https://milloapp.com
 */

const db = require('@millo/database');
const dashboards = require('@millo/dashboards');
const { validateId } = require('../lib/validateId');

function requireStaffAdminOrSupport(request, reply) {
  const user = request.user;
  if (!user) {
    reply.status(401).send({ error: 'UNAUTHORIZED' });
    return false;
  }
  if (!dashboards.hasRole(user, 'admin') && !dashboards.hasRole(user, 'support')) {
    reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin or support required' });
    return false;
  }
  return true;
}

async function adminDevicesRoutes(app) {
  app.get('/admin/devices/:userId', async (request, reply) => {
    if (!requireStaffAdminOrSupport(request, reply)) return;

    const { userId } = request.params;
    if (!validateId(userId, reply)) return;

    const exists = await db.User.findById(userId).select('_id').lean();
    if (!exists) return reply.status(404).send({ error: 'USER_NOT_FOUND' });

    const limit = Math.min(Number(request.query?.limit) || 100, 200);
    const devices = await db.DeviceFingerprint.find({ userId })
      .sort({ lastSeenAt: -1 })
      .limit(limit)
      .lean();

    return reply.send({
      ok: true,
      userId,
      devices,
      count: devices.length,
    });
  });
}

module.exports = { adminDevicesRoutes };
