/**
 * Profile routes — followers, following, block list. https://milloapp.com
 */
const db = require('@millo/database');
const { validateId } = require('../lib/validateId');
const { logActivity } = require('../lib/activityService');

const FOLLOW_RATE_LIMIT = {
  max: 20,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many follow/unfollow actions — please slow down' }),
};

const BLOCK_RATE_LIMIT = {
  max: 20,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many block actions — please slow down' }),
};

function requireUser(req, reply, next) {
  if (!req.user || !req.user._id) return reply.status(401).send({ error: 'UNAUTHORIZED' });
  next();
}

async function profileRoutes(app) {

  /* ── Update own profile ── */
  app.patch('/profile/me', { preHandler: requireUser }, async (request, reply) => {
    const ALLOWED = ['displayName', 'username', 'bio', 'avatarUrl', 'bannerUrl', 'socialLinks', 'badges', 'privacy'];
    const patch   = {};
    for (const key of ALLOWED) {
      if (request.body?.[key] !== undefined) patch[key] = request.body[key];
    }
    if (!Object.keys(patch).length) return reply.status(400).send({ error: 'NOTHING_TO_UPDATE' });

    // Field-level validation
    if (patch.displayName !== undefined) {
      if (typeof patch.displayName !== 'string' || patch.displayName.trim().length === 0) {
        return reply.status(400).send({ error: 'INVALID_DISPLAY_NAME', message: 'displayName must be a non-empty string' });
      }
      if (patch.displayName.length > 60) {
        return reply.status(400).send({ error: 'DISPLAY_NAME_TOO_LONG', message: 'displayName must be 60 characters or fewer' });
      }
      patch.displayName = patch.displayName.trim();
    }
    if (patch.username !== undefined) {
      if (typeof patch.username !== 'string' || !/^[a-z0-9_]{3,30}$/.test(patch.username)) {
        return reply.status(400).send({ error: 'INVALID_USERNAME', message: 'username must be 3–30 characters and contain only lowercase letters, numbers, and underscores' });
      }
    }
    if (patch.bio !== undefined) {
      if (typeof patch.bio !== 'string') {
        return reply.status(400).send({ error: 'INVALID_BIO' });
      }
      if (patch.bio.length > 500) {
        return reply.status(400).send({ error: 'BIO_TOO_LONG', message: 'bio must be 500 characters or fewer' });
      }
      patch.bio = patch.bio.trim();
    }
    if (patch.avatarUrl !== undefined && patch.avatarUrl && typeof patch.avatarUrl === 'string') {
      if (!patch.avatarUrl.startsWith('https://') && !patch.avatarUrl.startsWith('http://')) {
        return reply.status(400).send({ error: 'INVALID_AVATAR_URL', message: 'avatarUrl must be a valid URL' });
      }
    }
    if (patch.badges !== undefined) {
      if (!Array.isArray(patch.badges)) {
        return reply.status(400).send({ error: 'INVALID_BADGES', message: 'badges must be an array' });
      }
      patch.badges = patch.badges.slice(0, 10).map((b) => ({
        badgeId: String(b?.badgeId || b).slice(0, 50),
        label:   typeof b?.label === 'string' ? b.label.slice(0, 50) : '',
        icon:    typeof b?.icon === 'string' ? b.icon.slice(0, 200) : undefined,
      })).filter((b) => b.badgeId);
    }
    if (patch.privacy !== undefined) {
      if (typeof patch.privacy !== 'object') return reply.status(400).send({ error: 'INVALID_PRIVACY', message: 'privacy must be an object' });
      const allowed = ['showOnline', 'showFollowers', 'showSubscriptions', 'allowDmFrom'];
      const out = {};
      for (const [k, v] of Object.entries(patch.privacy)) {
        if (!allowed.includes(k)) continue;
        if (k === 'allowDmFrom') out[k] = ['everyone', 'followers', 'none'].includes(v) ? v : 'everyone';
        else out[k] = typeof v === 'boolean' ? v : !!v;
      }
      patch.privacy = out;
    }

    // Validate username uniqueness if changing it
    if (patch.username) {
      const existing = await db.Profile.findOne({
        username: patch.username,
        userId:   { $ne: request.user._id },
      }).lean();
      if (existing) return reply.status(409).send({ error: 'USERNAME_TAKEN' });
    }

    const profile = await db.Profile.findOneAndUpdate(
      { userId: request.user._id },
      { $set: patch },
      { new: true, upsert: true }
    ).lean();
    return reply.send({ ok: true, profile });
  });

  app.post('/profile/follow/:userId', { preHandler: requireUser, config: { rateLimit: FOLLOW_RATE_LIMIT } }, async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const followerId = request.user._id.toString();
    const followingId = request.params.userId;
    if (followerId === followingId) return reply.status(400).send({ error: 'CANNOT_FOLLOW_SELF' });
    let follow = await db.Follow.findOne({ followerId, followingId });
    if (!follow) {
      follow = await db.Follow.create({ followerId, followingId });
      logActivity(followerId, 'follow', followingId).catch(() => {});
    }
    return reply.send({ ok: true, follow: follow.toObject() });
  });

  app.delete('/profile/follow/:userId', { preHandler: requireUser, config: { rateLimit: FOLLOW_RATE_LIMIT } }, async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const result = await db.Follow.deleteOne({ followerId: request.user._id, followingId: request.params.userId });
    return reply.send({ ok: true, deleted: result.deletedCount > 0 });
  });

  app.get('/profile/:userId/followers', async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const { limit = 50, offset = 0 } = request.query ?? {};
    const q = { followingId: request.params.userId };
    const [list, total] = await Promise.all([
      db.Follow.find(q).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).populate('followerId', 'email').lean(),
      db.Follow.countDocuments(q),
    ]);
    const userIds = list.map((f) => f.followerId?._id).filter(Boolean);
    const profiles = await db.Profile.find({ userId: { $in: userIds } }).select('userId displayName avatarUrl meta').lean();
    const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const enriched = list.map((f) => {
      const uid = f.followerId?._id;
      const p = uid ? profileMap[String(uid)] : null;
      return { ...f, displayName: p?.displayName || f.followerId?.email?.split('@')[0] || 'User', avatarUrl: p?.avatarUrl, username: p?.meta?.username };
    });
    return reply.send({ followers: enriched, total, limit: Number(limit), offset: Number(offset) });
  });

  app.get('/profile/:userId/following', async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const { limit = 50, offset = 0 } = request.query ?? {};
    const q = { followerId: request.params.userId };
    const [list, total] = await Promise.all([
      db.Follow.find(q).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).populate('followingId', 'email').lean(),
      db.Follow.countDocuments(q),
    ]);
    const userIds = list.map((f) => f.followingId?._id).filter(Boolean);
    const profiles = await db.Profile.find({ userId: { $in: userIds } }).select('userId displayName avatarUrl meta').lean();
    const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const enriched = list.map((f) => {
      const uid = f.followingId?._id;
      const p = uid ? profileMap[String(uid)] : null;
      return { ...f, displayName: p?.displayName || f.followingId?.email?.split('@')[0] || 'User', avatarUrl: p?.avatarUrl, username: p?.meta?.username };
    });
    return reply.send({ following: enriched, total, limit: Number(limit), offset: Number(offset) });
  });

  app.post('/profile/block/:userId', { preHandler: requireUser, config: { rateLimit: BLOCK_RATE_LIMIT } }, async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const blockerId = request.user._id.toString();
    const blockedUserId = request.params.userId;
    if (blockerId === blockedUserId) return reply.status(400).send({ error: 'CANNOT_BLOCK_SELF' });
    let block = await db.Block.findOne({ blockerId, blockedUserId });
    if (!block) block = await db.Block.create({ blockerId, blockedUserId });
    return reply.send({ ok: true, block: block.toObject() });
  });

  /* Body-based block — used by web CreatorPage: POST /profile/block { targetUserId } */
  app.post('/profile/block', { preHandler: requireUser, config: { rateLimit: BLOCK_RATE_LIMIT } }, async (request, reply) => {
    const blockerId    = request.user._id.toString();
    const blockedUserId = request.body?.targetUserId;
    if (!blockedUserId) return reply.status(400).send({ error: 'targetUserId required' });
    if (blockerId === blockedUserId) return reply.status(400).send({ error: 'CANNOT_BLOCK_SELF' });
    let block = await db.Block.findOne({ blockerId, blockedUserId });
    if (!block) block = await db.Block.create({ blockerId, blockedUserId });
    return reply.send({ ok: true, blocked: true });
  });

  /* Body-based unblock — POST /profile/unblock { targetUserId } */
  app.post('/profile/unblock', { preHandler: requireUser }, async (request, reply) => {
    const blockerId    = request.user._id.toString();
    const blockedUserId = request.body?.targetUserId;
    if (!blockedUserId) return reply.status(400).send({ error: 'targetUserId required' });
    await db.Block.deleteOne({ blockerId, blockedUserId });
    return reply.send({ ok: true, blocked: false });
  });

  app.delete('/profile/block/:userId', { preHandler: requireUser }, async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const result = await db.Block.deleteOne({ blockerId: request.user._id, blockedUserId: request.params.userId });
    return reply.send({ ok: true, deleted: result.deletedCount > 0 });
  });

  app.get('/profile/blocked', { preHandler: requireUser }, async (request, reply) => {
    const list = await db.Block.find({ blockerId: request.user._id }).populate('blockedUserId', 'email').lean();
    const userIds = list.map((b) => b.blockedUserId?._id).filter(Boolean);
    const profiles = await db.Profile.find({ userId: { $in: userIds } }).select('userId displayName avatarUrl meta').lean();
    const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const enriched = list.map((b) => {
      const uid = b.blockedUserId?._id;
      const p = uid ? profileMap[String(uid)] : null;
      return {
        _id: b._id,
        userId: uid,
        email: b.blockedUserId?.email,
        displayName: p?.displayName || b.blockedUserId?.email?.split('@')[0] || 'User',
        avatarUrl: p?.avatarUrl || null,
        username: p?.meta?.username || null,
      };
    });
    return reply.send({ blocked: enriched });
  });

  /* ── Creator badges ── */
  app.get('/profile/:userId/badges', async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const profile = await db.Profile.findOne({ userId: request.params.userId })
      .select('badges')
      .lean();
    const badges = (profile?.badges || []).map((b) => ({ badgeId: b.badgeId, label: b.label || b.badgeId, icon: b.icon }));
    return reply.send({ badges });
  });

  /* ── Activity history (own profile) — AuditLog-based ── */
  app.get('/profile/activity', { preHandler: requireUser }, async (request, reply) => {
    const userId = request.user._id;
    const { limit = 50, offset = 0 } = request.query ?? {};
    const lim = Math.min(Number(limit), 100);

    const auditLogs = await db.AuditLog.find({ actorId: userId })
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(lim)
      .lean();

    const items = auditLogs.map((a) => ({
      type: 'audit',
      action: a.action,
      resourceType: a.resourceType,
      resourceId: a.resourceId,
      meta: a.meta,
      createdAt: a.createdAt,
    }));

    return reply.send({ activity: items, limit: lim, offset: Number(offset) });
  });

  /* ── Activity feed (profile) — follow, video_upload, purchase, gift_sent, live_started ── */
  app.get('/profile/:userId/activity', async (request, reply) => {
    let userId = request.params.userId;
    if (userId === 'me') {
      if (!request.user?._id) return reply.status(401).send({ error: 'UNAUTHORIZED' });
      userId = request.user._id;
    } else if (!validateId(userId, reply)) return;
    const { limit = 50, offset = 0 } = request.query ?? {};
    const lim = Math.min(Number(limit), 100);

    const feed = await db.Activity.find({ userId })
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(lim)
      .lean();

    return reply.send({ activity: feed, limit: lim, offset: Number(offset) });
  });
}

module.exports = { profileRoutes };

