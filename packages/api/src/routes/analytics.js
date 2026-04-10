'use strict';
/**
 * Phase 12 — Global Analytics & Business Intelligence.
 * Key metrics: DAU, MAU, creator revenue, ARPU, retention, conversion.
 * https://milloapp.com
 */
const analyticsService = require('../services/analyticsService');
const dashboards = require('@millo/dashboards');
const { resolveSession } = require('./auth');

async function getRequestUser(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
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

async function analyticsRoutes(app) {
  /* ── Current metrics (real-time) ── */
  app.get('/analytics/metrics', async (req, reply) => {
    const user = await getRequestUser(req);
    if (requireAdmin(user, reply)) return;
    try {
      const metrics = await analyticsService.getCurrentMetrics();
      return reply.send({ ok: true, metrics });
    } catch (err) {
      req.log.error({ err }, 'Analytics metrics failed');
      return reply.status(500).send({ error: 'ANALYTICS_ERROR', message: err?.message });
    }
  });

  /* ── Feed product KPIs: watch time, CTR, completion, D1/D7 retention — Part 10 ── */
  app.get('/analytics/feed-kpis', async (req, reply) => {
    const user = await getRequestUser(req);
    if (requireAdmin(user, reply)) return;
    try {
      const data = await analyticsService.getFeedProductMetrics(req.query ?? {});
      return reply.send({ ok: true, ...data });
    } catch (err) {
      req.log.error({ err }, 'Analytics feed-kpis failed');
      return reply.status(500).send({ error: 'ANALYTICS_ERROR', message: err?.message });
    }
  });

  /* ── Device breakdown (DAU by device type) — Phase 12 ── */
  app.get('/analytics/device-breakdown', async (req, reply) => {
    const user = await getRequestUser(req);
    if (requireAdmin(user, reply)) return;
    try {
      const breakdown = await analyticsService.getDeviceBreakdown();
      return reply.send({ ok: true, breakdown });
    } catch (err) {
      req.log.error({ err }, 'Analytics device-breakdown failed');
      return reply.status(500).send({ error: 'ANALYTICS_ERROR', message: err?.message });
    }
  });

  /* ── Stored metric history (for Grafana/Looker) ── */
  app.get('/analytics/metrics/history', async (req, reply) => {
    const user = await getRequestUser(req);
    if (requireAdmin(user, reply)) return;
    const db = require('@millo/database');
    const { start, end, metric } = req.query ?? {};
    const filter = {};
    if (start) filter.date = { ...filter.date, $gte: new Date(start) };
    if (end) filter.date = { ...filter.date, $lte: new Date(end) };
    if (metric) filter.metric = metric;
    try {
      const rows = await db.PlatformMetric.find(filter).sort({ date: 1 }).lean();
      return reply.send({ ok: true, data: rows });
    } catch (err) {
      req.log.error({ err }, 'Analytics history failed');
      return reply.status(500).send({ error: 'ANALYTICS_ERROR', message: err?.message });
    }
  });

  /* ── Store daily snapshot (cron) ── */
  app.post('/analytics/snapshot', async (req, reply) => {
    const user = await getRequestUser(req);
    if (requireAdmin(user, reply)) return;
    const { date } = req.body ?? {};
    const targetDate = date ? new Date(date) : new Date();
    try {
      const metrics = await analyticsService.storeDailySnapshot(targetDate);
      return reply.send({ ok: true, date: targetDate.toISOString().slice(0, 10), metrics });
    } catch (err) {
      req.log.error({ err }, 'Analytics snapshot failed');
      return reply.status(500).send({ error: 'ANALYTICS_ERROR', message: err?.message });
    }
  });
}

module.exports = { analyticsRoutes };
