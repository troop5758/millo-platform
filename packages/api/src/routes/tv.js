/**
 * TV API — read-only. Apple TV / Android TV; device pairing required.
 * No purchases. https://milloapp.com
 */
const db = require('@millo/database');
const tv = require('@millo/tv');
const { validateId } = require('../lib/validateId');

function getRequestUser(req) {
  if (req.user && req.user._id) return req.user;
  // Header-based auth is only permitted outside production (local / staging dev tools).
  if (process.env.NODE_ENV === 'production') return null;
  const id = req.headers['x-user-id'];
  if (!id) return null;
  return { _id: id };
}

async function tvRoutes(app) {
  // Pairing: create code (from web/app — needs auth)
  app.post('/tv/pairing/code', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const out = await tv.createPairingCode(user._id);
      return reply.send(out);
    } catch (e) {
      throw e;
    }
  });

  // Pairing: link device (from TV — no auth; code + deviceId + platform)
  app.post('/tv/pairing/link', async (req, reply) => {
    try {
      const { code, deviceId, platform } = req.body || {};
      if (!code || !deviceId || !platform) return reply.status(400).send({ error: 'MISSING_CODE_DEVICE_OR_PLATFORM' });
      const out = await tv.pairDevice(code, deviceId, platform);
      return reply.send(out);
    } catch (e) {
      if (e.message === 'INVALID_PLATFORM') return reply.status(400).send({ error: e.message });
      if (e.message === 'INVALID_OR_EXPIRED_CODE') return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  // Read-only: list channels
  app.get('/tv/channels', async (req, reply) => {
    const { limit = 50, offset = 0 } = req.query ?? {};
    const q = { status: 'active' };
    const [channels, total] = await Promise.all([
      db.TVChannel.find(q).skip(Number(offset)).limit(Math.min(Number(limit), 200)).lean(),
      db.TVChannel.countDocuments(q),
    ]);
    return reply.send({ channels, total, limit: Number(limit), offset: Number(offset) });
  });

  // Read-only: schedule for a channel
  app.get('/tv/channels/:channelId/schedule', async (req, reply) => {
    if (!validateId(req.params.channelId, reply)) return;
    const { limit = 100, offset = 0 } = req.query ?? {};
    const q = { channelId: req.params.channelId };
    const [schedule, total] = await Promise.all([
      db.TVSchedule.find(q).sort({ startsAt: 1 }).skip(Number(offset)).limit(Math.min(Number(limit), 200)).lean(),
      db.TVSchedule.countDocuments(q),
    ]);
    return reply.send({ schedule, total, limit: Number(limit), offset: Number(offset) });
  });

  // Read-only: list live streams (for TV browse)
  app.get('/tv/streams', async (req, reply) => {
    const { limit = 50, offset = 0 } = req.query ?? {};
    const q = { status: 'live' };
    const [streams, total] = await Promise.all([
      db.LiveStream.find(q).select('userId title status startedAt').skip(Number(offset)).limit(Math.min(Number(limit), 100)).lean(),
      db.LiveStream.countDocuments(q),
    ]);
    return reply.send({ streams, total, limit: Number(limit), offset: Number(offset) });
  });

  // Paired devices (for web — needs auth)
  app.get('/tv/devices', async (req, reply) => {
    const user = getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const devices = await tv.getPairedDevices(user._id);
    return reply.send(devices);
  });
}

module.exports = { tvRoutes };
