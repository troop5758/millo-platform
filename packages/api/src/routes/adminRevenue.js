'use strict';
/**
 * Admin revenue analytics — ARPU, LTV proxy, conversion, ad spend proxy.
 * GET /admin/revenue/stats?from=&to=  (ISO dates; default last 30 days)
 * https://milloapp.com
 */
const dashboards = require('@millo/dashboards');
const { resolveSession } = require('./auth');
const revenueAnalytics = require('../services/revenueAnalytics.service');

async function getRequestUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (token) return await resolveSession(token).catch(() => null);
  if (req.user && req.user._id) return req.user;
  if (process.env.NODE_ENV !== 'production') {
    const id = req.headers['x-user-id'];
    const role = req.headers['x-user-role'] || 'user';
    if (id) return { _id: id, role };
  }
  return null;
}

function requireAdmin(user, reply) {
  if (!user) {
    reply.status(401).send({ error: 'UNAUTHORIZED' });
    return true;
  }
  if (!dashboards.hasRole(user, 'admin')) {
    reply.status(403).send({ error: 'FORBIDDEN' });
    return true;
  }
  return false;
}

async function adminRevenueRoutes(app) {
  app.get('/admin/revenue/stats', async (request, reply) => {
    const user = await getRequestUser(request);
    if (requireAdmin(user, reply)) return;
    try {
      const q = request.query ?? {};
      const stats = await revenueAnalytics.getRevenueStats({
        from: q.from,
        to: q.to,
      });
      return reply.send({ ok: true, ...stats });
    } catch (err) {
      if (err.message === 'INVALID_FROM_DATE' || err.message === 'INVALID_TO_DATE') {
        return reply.status(400).send({ error: 'INVALID_DATE', message: err.message });
      }
      request.log.error({ err }, 'admin revenue stats failed');
      return reply.status(500).send({ error: 'REVENUE_STATS_ERROR', message: err?.message });
    }
  });
}

module.exports = { adminRevenueRoutes };
