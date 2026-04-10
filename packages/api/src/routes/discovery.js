'use strict';
/**
 * Discovery / recommendation filter version pinning.
 *
 * GET   /discovery/models           — list active model versions and rollout %
 * GET   /discovery/models/:modelId  — get one model
 * PATCH /admin/discovery/models/:modelId — admin: set modelVersion and rollout (filter version pinning)
 *
 * Collection: discovery_models. Enables testing new recommendation models (e.g. v3 at 20%).
 * https://milloapp.com
 */
const db = require('@millo/database');

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { resolveSession } = require('./auth');
  return resolveSession(token);
}

async function discoveryRoutes(app) {
  /* ── GET /discovery/models ── */
  app.get('/discovery/models', async (_request, reply) => {
    const list = await db.DiscoveryModel.find({}).sort({ modelId: 1 }).lean();
    const models = list.map((d) => ({
      modelId: d.modelId,
      modelVersion: d.modelVersion,
      rollout: d.rollout,
      updatedAt: d.updatedAt,
    }));
    return reply.send({ models });
  });

  /* ── GET /discovery/models/:modelId ── */
  app.get('/discovery/models/:modelId', async (request, reply) => {
    const { modelId } = request.params;
    if (!modelId || !modelId.trim()) return reply.status(400).send({ error: 'modelId required' });
    const doc = await db.DiscoveryModel.findOne({ modelId: modelId.trim() }).lean();
    if (!doc) return reply.status(404).send({ error: 'NOT_FOUND' });
    return reply.send({
      modelId: doc.modelId,
      modelVersion: doc.modelVersion,
      rollout: doc.rollout,
      updatedAt: doc.updatedAt,
    });
  });

  /* ── PATCH /admin/discovery/models/:modelId — filter version pinning ── */
  app.patch('/admin/discovery/models/:modelId', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });

    const { modelId } = request.params;
    if (!modelId || !modelId.trim()) return reply.status(400).send({ error: 'modelId required' });
    const id = modelId.trim();
    const { modelVersion, rollout } = request.body ?? {};
    const version = modelVersion != null ? String(modelVersion).trim() : undefined;
    const rolloutNum = rollout != null ? Math.min(100, Math.max(0, Number(rollout))) : undefined;
    if (version === undefined && rolloutNum === undefined) {
      return reply.status(400).send({ error: 'modelVersion or rollout required' });
    }

    const update = {};
    if (version !== undefined) update.modelVersion = version;
    if (rolloutNum !== undefined) update.rollout = rolloutNum;

    const doc = await db.DiscoveryModel.findOneAndUpdate(
      { modelId: id },
      { $set: update },
      { upsert: true, new: true }
    ).lean();
    return reply.send({
      modelId: doc.modelId,
      modelVersion: doc.modelVersion,
      rollout: doc.rollout,
      updatedAt: doc.updatedAt,
    });
  });
}

module.exports = { discoveryRoutes };
