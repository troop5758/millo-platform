/**
 * Level & Trust routes — gating enforced. Includes dynamic trust score (0–100, anti-abuse).
 * Admin: GET /admin/trust/:userId/history for trust score timeline.
 * https://milloapp.com
 */
const levelTrust = require('@millo/level-trust');
const dashboards = require('@millo/dashboards');
const { validateId } = require('../lib/validateId');
const trustScoreEngine = require('../services/trustScoreEngine');
const trustHistoryService = require('../services/trustHistoryService');

async function requireAdmin(request, reply) {
  const user = request.user;
  if (!user) {
    reply.status(401).send({ error: 'UNAUTHORIZED' });
    return null;
  }
  if (!dashboards.hasRole(user, 'admin')) {
    reply.status(403).send({ error: 'FORBIDDEN' });
    return null;
  }
  return user;
}

async function levelTrustRoutes(app) {
  app.get('/level/:userId', async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const { userId } = request.params;
    const level = await levelTrust.getLevel(userId);
    return reply.send(level);
  });

  app.get('/trust/:userId', async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const { userId } = request.params;
    const [trust, tier, trustScore] = await Promise.all([
      levelTrust.getTrust(userId),
      levelTrust.getTrustTier(userId),
      trustScoreEngine.getTrustScore(userId),
    ]);
    return reply.send({ trust, tier, trustScore });
  });

  // Gating enforced: require minLevel, minTrust and/or minTier or 403.
  // userId is taken from the authenticated session — callers cannot probe other users.
  app.post('/gated', async (request, reply) => {
    const sessionUser = request.user;
    if (!sessionUser) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const userId = String(sessionUser._id);
    if (!validateId(userId, reply)) return;
    const { minLevel, minTrust, minTier } = request.body || {};
    try {
      if (minLevel != null) await levelTrust.requireLevel(userId, minLevel);
      if (minTrust != null) await levelTrust.requireTrust(userId, minTrust);
      if (minTier != null) await levelTrust.requireTrustTier(userId, minTier);
      return reply.send({ ok: true });
    } catch (err) {
      if (err.message === 'LEVEL_GATE_FAILED' || err.message === 'TRUST_GATE_FAILED' || err.message === 'TRUST_TIER_GATE_FAILED') {
        return reply.status(403).send({ error: err.message });
      }
      throw err;
    }
  });

  /* ── Admin: trust score timeline (chart data) ── */
  app.get('/admin/trust/:userId/history', async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    if (!validateId(request.params.userId, reply)) return;
    const { userId } = request.params;
    const limit = request.query.limit ? Math.min(500, Math.max(1, Number(request.query.limit))) : 90;
    const order = request.query.order === 'asc' ? 1 : -1;
    const history = await trustHistoryService.getHistory(userId, { limit, order });
    return reply.send(history);
  });
}

module.exports = { levelTrustRoutes };
