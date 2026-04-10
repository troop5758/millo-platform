/**
 * DM routes — typing, block check, messages, message delete, paid calls.
 * Real-time delivery via userSockets when recipient is connected.
 * https://milloapp.com
 */
const db = require('@millo/database');
const userSockets = require('../lib/userSockets');
const { validateId } = require('../lib/validateId');
const dmMonetization = require('@millo/dm-monetization');

const typingState = new Map();

// Rate-limit configs
const DM_SEND_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many messages — please slow down' }),
};

async function dmRoutes(app) {
  /* ── Conversations list ── */
  app.get('/dm/conversations', async (request, reply) => {
    const me = request.user?._id;
    if (!me) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const limit  = Math.min(Number(request.query?.limit  ?? 30), 100);
    const offset = Math.max(Number(request.query?.offset ?? 0),  0);

    // Get all distinct users this person has conversed with
    const sent     = await db.DMMessage.distinct('receiverId', { senderId: me,  deletedAt: null });
    const received = await db.DMMessage.distinct('senderId',   { receiverId: me, deletedAt: null });
    const ids      = [...new Set([...sent.map(String), ...received.map(String)])];

    // For each conversation partner, get last message + unread count
    const conversations = await Promise.all(ids.map(async (otherId) => {
      const [last, unread, profile] = await Promise.all([
        db.DMMessage.findOne({
          $or: [{ senderId: me, receiverId: otherId }, { senderId: otherId, receiverId: me }],
          deletedAt: null,
        }).sort({ createdAt: -1 }).lean(),
        db.DMMessage.countDocuments({ senderId: otherId, receiverId: me, readAt: null, deletedAt: null }),
        db.Profile.findOne({ userId: otherId }).lean().catch(() => null),
      ]);
      return {
        userId: otherId,
        displayName: profile?.displayName || 'User',
        avatarUrl:   profile?.avatarUrl   || null,
        lastMessage: last ? { body: last.body, createdAt: last.createdAt, fromMe: String(last.senderId) === String(me) } : null,
        unreadCount: unread,
      };
    }));

    // Sort by last message time
    conversations.sort((a, b) => {
      const ta = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt) : 0;
      const tb = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt) : 0;
      return tb - ta;
    });

    const total = conversations.length;
    const page  = conversations.slice(offset, offset + limit);
    return reply.send({ conversations: page, total, limit, offset });
  });

  app.post('/dm/messages', { config: { rateLimit: DM_SEND_RATE_LIMIT } }, async (request, reply) => {
    const senderId = request.user?._id;
    if (!senderId) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const ghostBanService = require('../services/ghostBanService');
    if (await ghostBanService.isDmRateLimitExceeded(senderId)) {
      return reply.status(429).send({ error: 'RATE_LIMITED', message: 'DM limit reached. Try again later.' });
    }
    const { receiverId, body } = request.body || {};
    if (!receiverId || typeof receiverId !== 'string') {
      return reply.status(400).send({ error: 'RECEIVER_REQUIRED', message: 'receiverId is required' });
    }
    if (!validateId(receiverId, reply)) return;
    if (body == null || typeof body !== 'string' || body.trim().length === 0) {
      return reply.status(400).send({ error: 'BODY_REQUIRED', message: 'body is required' });
    }
    if (body.length > 10000) {
      return reply.status(400).send({ error: 'BODY_TOO_LONG', message: 'message body must be 10,000 characters or fewer' });
    }
    const sanitized = body.replace(/<[^>]*>/g, '').trim(); // strip HTML tags
    const block = await db.Block.findOne({ blockerId: senderId, blockedUserId: receiverId });
    if (block) return reply.status(403).send({ error: 'BLOCKED' });
    const msg = await db.DMMessage.create({ senderId, receiverId, body: sanitized });
    // Real-time push to recipient if connected
    const senderProfile = await db.Profile.findOne({ userId: senderId }).lean().catch(() => null);
    userSockets.push(String(receiverId), {
      type: 'dm_message',
      data: {
        ...msg.toObject(),
        fromUserId:  String(senderId),
        displayName: senderProfile?.displayName || 'User',
        avatarUrl:   senderProfile?.avatarUrl   || null,
      },
    });
    return reply.send({ message: msg.toObject() });
  });

  app.get('/dm/conversation/:userId/messages', async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const me = request.user?._id;
    if (!me) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const other = request.params.userId;
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const list = await db.DMMessage.find({
      $or: [{ senderId: me, receiverId: other }, { senderId: other, receiverId: me }],
      deletedAt: null,
    }).sort({ createdAt: -1 }).limit(limit).lean();
    return reply.send({ messages: list.reverse() });
  });

  app.delete('/dm/messages/:id', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const userId = request.user?._id;
    if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const msg = await db.DMMessage.findById(request.params.id);
    if (!msg) return reply.status(404).send({ error: 'MESSAGE_NOT_FOUND' });
    if (msg.senderId.toString() !== userId.toString()) return reply.status(403).send({ error: 'FORBIDDEN' });
    msg.deletedAt = new Date();
    await msg.save();
    return reply.send({ ok: true, messageId: request.params.id });
  });

  /* ── Mark messages from a user as read ── */
  app.post('/dm/read/:userId', async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const me    = request.user?._id;
    if (!me) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const other = request.params.userId;
    const result = await db.DMMessage.updateMany(
      { senderId: other, receiverId: me, readAt: null, deletedAt: null },
      { $set: { readAt: new Date() } }
    );
    // Push read-receipt event to the sender so their UI can show "✓✓ Read"
    userSockets.push(String(other), {
      type: 'dm_read',
      data: { byUserId: String(me), count: result.modifiedCount },
    });
    return reply.send({ ok: true, marked: result.modifiedCount });
  });

  app.post('/dm/typing', async (request, reply) => {
    const userId = request.user?._id?.toString();
    if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { toUserId, active } = request.body || {};
    if (!toUserId) return reply.status(400).send({ error: 'toUserId required' });
    // Push typing event via WebSocket
    userSockets.push(String(toUserId), {
      type: 'typing',
      data: { fromUserId: userId, isTyping: !!active },
    });
    return reply.send({ ok: true });
  });

  app.get('/dm/blocked', async (request, reply) => {
    const userId = request.user?._id?.toString();
    if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const list = await db.Block.find({ blockerId: userId }).select('blockedUserId').lean();
    return reply.send({ blocked: list.map((b) => b.blockedUserId) });
  });

  app.get('/dm/blocked/:userId', async (request, reply) => {
    const blockerId = request.user?._id?.toString();
    if (!blockerId) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const blockedUserId = request.params.userId;
    const block = await db.Block.findOne({ blockerId, blockedUserId });
    return reply.send({ blocked: !!block });
  });

  /* ── Paid calls (DM monetization) ── */
  app.get('/dm/calls/config', async (request, reply) => {
    const me = request.user?._id;
    if (!me) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const freeBuffer = dmMonetization.getFreeBufferMinutes?.() ?? 5;
    const centsPerMinute = dmMonetization.getCentsPerMinute?.() ?? 10;
    const maxSessionMinutes = dmMonetization.getMaxSessionMinutes?.() ?? 120;
    return reply.send({
      freeBufferMinutes: freeBuffer,
      centsPerMinute,
      maxSessionMinutes,
    });
  });

  app.post('/dm/calls/request', async (request, reply) => {
    const userId = request.user?._id;
    if (!userId) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { creatorId } = request.body || {};
    if (!creatorId || typeof creatorId !== 'string') {
      return reply.status(400).send({ error: 'CREATOR_REQUIRED', message: 'creatorId is required' });
    }
    if (!validateId(creatorId, reply)) return;
    if (String(creatorId) === String(userId)) {
      return reply.status(400).send({ error: 'CANNOT_CALL_SELF', message: 'Cannot request a call with yourself' });
    }
    const block = await db.Block.findOne({
      $or: [{ blockerId: userId, blockedUserId: creatorId }, { blockerId: creatorId, blockedUserId: userId }],
    });
    if (block) return reply.status(403).send({ error: 'BLOCKED' });
    try {
      const session = await dmMonetization.startSession(creatorId, userId);
      const creatorProfile = await db.Profile.findOne({ userId: creatorId }).lean().catch(() => null);
      userSockets.push(String(creatorId), {
        type: 'call_request',
        data: { sessionId: session._id, userId: String(userId), displayName: creatorProfile?.displayName || 'User' },
      });
      return reply.send({ session, wsPath: `/ws/meeting/${session._id}` });
    } catch (err) {
      if (err.message === 'SESSION_NOT_FOUND') return reply.status(404).send({ error: err.message });
      request.log?.warn?.({ err }, 'dm/calls/request failed');
      return reply.status(500).send({ error: 'REQUEST_FAILED', message: err.message || 'Failed to start call' });
    }
  });

  app.get('/dm/calls/sessions', async (request, reply) => {
    const me = request.user?._id;
    if (!me) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const limit = Math.min(Number(request.query?.limit ?? 30), 100);
    const offset = Math.max(Number(request.query?.offset ?? 0), 0);
    const list = await db.DMSession.find({
      $or: [{ creatorId: me }, { userId: me }],
    })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
    const ids = [...new Set(list.flatMap((s) => [s.creatorId?.toString(), s.userId?.toString()].filter(Boolean)))];
    const profiles = await db.Profile.find({ userId: { $in: ids } }).lean();
    const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const sessions = list.map((s) => {
      const otherId = String(s.creatorId) === String(me) ? s.userId : s.creatorId;
      const profile = profileMap[String(otherId)];
      return {
        ...s,
        otherUserId: otherId,
        otherDisplayName: profile?.displayName || 'User',
        otherAvatarUrl: profile?.avatarUrl || null,
        isCreator: String(s.creatorId) === String(me),
      };
    });
    const total = await db.DMSession.countDocuments({ $or: [{ creatorId: me }, { userId: me }] });
    return reply.send({ sessions, total, limit, offset });
  });

  app.post('/dm/calls/:sessionId/end', async (request, reply) => {
    if (!validateId(request.params.sessionId, reply)) return;
    const me = request.user?._id;
    if (!me) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const sessionId = request.params.sessionId;
    const session = await db.DMSession.findById(sessionId);
    if (!session) return reply.status(404).send({ error: 'SESSION_NOT_FOUND' });
    const isParticipant = String(session.creatorId) === String(me) || String(session.userId) === String(me);
    if (!isParticipant) return reply.status(403).send({ error: 'FORBIDDEN' });
    if (session.endedAt) return reply.send({ session: session.toObject() });
    try {
      const updated = await dmMonetization.endSession(sessionId);
      const otherId = String(session.creatorId) === String(me) ? session.userId : session.creatorId;
      userSockets.push(String(otherId), { type: 'call_ended', data: { sessionId, endedBy: String(me) } });
      return reply.send({ session: updated });
    } catch (err) {
      if (err.message === 'SESSION_NOT_FOUND') return reply.status(404).send({ error: err.message });
      request.log?.warn?.({ err }, 'dm/calls/end failed');
      return reply.status(500).send({ error: 'END_FAILED', message: err.message || 'Failed to end call' });
    }
  });

  app.post('/dm/calls/:sessionId/approve', async (request, reply) => {
    if (!validateId(request.params.sessionId, reply)) return;
    const creatorId = request.user?._id;
    if (!creatorId) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const sessionId = request.params.sessionId;
    const session = await db.DMSession.findById(sessionId);
    if (!session) return reply.status(404).send({ error: 'SESSION_NOT_FOUND' });
    if (String(session.creatorId) !== String(creatorId)) return reply.status(403).send({ error: 'FORBIDDEN' });
    if (session.approved) return reply.send({ session: session.toObject() });
    try {
      const updated = await dmMonetization.approveSession(sessionId, creatorId);
      return reply.send({ session: updated });
    } catch (err) {
      if (err.message === 'SESSION_NOT_FOUND') return reply.status(404).send({ error: err.message });
      if (err.message === 'UNAUTHORIZED') return reply.status(403).send({ error: err.message });
      request.log?.warn?.({ err }, 'dm/calls/approve failed');
      return reply.status(500).send({ error: 'APPROVE_FAILED', message: err.message || 'Failed to approve' });
    }
  });
}

module.exports = { dmRoutes };
