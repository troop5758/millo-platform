/**
 * Live streaming routes + WebSocket gateway. https://milloapp.com
 */
const mongoose = require('mongoose');
const live = require('@millo/live');
const milla = require('@millo/milla');
const db   = require('@millo/database');
const { validateId } = require('../lib/validateId');
const viewerCountRedis = require('../lib/viewerCountRedis');
const kafka = require('../services/kafkaEventBus');
const liveStreamBotDetection = require('../services/liveStreamBotDetection');
const { writeAdminAuditLog } = require('../services/auditLog');
const commerceIntegrity = require('../services/commerceIntegrity.service');

// Lazy-load to avoid circular dep at startup
let _broadcastStream = null;
function getBroadcastStream() {
  if (!_broadcastStream) {
    try { _broadcastStream = require('./userWs').broadcastStream; } catch { _broadcastStream = () => {}; }
  }
  return _broadcastStream;
}

// Janus WebRTC gateway service
const janusService = require('../services/live/janusService');
const streamService = require('../services/stream.service');
const { getLiveModeStatus } = require('../services/liveModeStatus');
const { withAuctionLock, withOrderedWalletLocks, LockContentionError } = require('../lib/walletLock');

/** Kill-switch: when false, all Live Filters SDK stubs disable instantly. Bound to LIVE_FILTERS_ENABLED. */
const getFiltersEnabled = live.getFiltersEnabled.bind(live);

const { liveChat } = require('../sockets');

function streamRoomId(streamId) {
  return liveChat.roomId('stream', streamId);
}

function broadcastToStream(streamId, payload) {
  liveChat.broadcastToRoom(streamRoomId(streamId), payload);
}

function getBroadcastToStream() {
  return broadcastToStream;
}

/** Resolve the authenticated user from the Bearer token in request headers. */
async function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { resolveSession } = require('./auth');
  return resolveSession(token);
}

/** Convenience: reply 401 when no authenticated user. */
function requireAuth(user, reply) {
  if (!user) { reply.status(401).send({ error: 'UNAUTHORIZED' }); return false; }
  return true;
}

/** Convenience: reply 403 when user doesn't own resource. */
function requireOwner(user, ownerId, reply) {
  if (user._id.toString() !== ownerId.toString()) {
    reply.status(403).send({ error: 'FORBIDDEN' }); return false;
  }
  return true;
}

/** Allow the request if the user is the owner OR has admin/mod role. */
function isPrivileged(user, ownerId) {
  if (user._id.toString() === ownerId.toString()) return true;
  return ['admin', 'mod', 'staff'].includes(user.role);
}

const STREAM_TYPES = ['standard', 'auction', 'paid_event', 'product_launch'];
const EVENT_TYPES = ['public', 'ticketed', 'auction', 'product_drop'];

const META_MERGE_MAX_KEYS = 40;

/** Allow only http(s) URLs for thumbnails/covers (blocks javascript: and similar). */
function safeHttpUrl(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().slice(0, 2048);
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

function normalizeTagsArray(tags) {
  if (!Array.isArray(tags)) return { ok: false, error: 'INVALID_TAGS' };
  return {
    ok: true,
    tags: tags
      .slice(0, 20)
      .map((t) => String(t).trim().slice(0, 50))
      .filter(Boolean),
  };
}

async function liveRoutes(app) {
  /** Public mode contract — WebRTC vs filters LIVE/STUBBED (no secrets). */
  app.get('/live/status', async (_request, reply) => reply.send(getLiveModeStatus()));
  app.get('/api/live/status', async (_request, reply) => reply.send(getLiveModeStatus()));

  /**
   * PUT /streams/:id/metadata — dedicated metadata update (title, category, tags, schedule, cover).
   * Auth: stream owner or admin/mod/staff (same privilege as PATCH /live/stream/:id).
   */
  app.put('/streams/:id/metadata', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const streamId = request.params.id;
    const stream = await db.LiveStream.findById(streamId);
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (!isPrivileged(user, stream.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });

    const body = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
    const allowed = new Set(['title', 'category', 'tags', 'scheduledAt', 'coverImageUrl']);
    const unknown = Object.keys(body).filter((k) => !allowed.has(k));
    if (unknown.length) {
      return reply.status(400).send({ error: 'INVALID_FIELDS', fields: unknown, message: 'Only title, category, tags, scheduledAt, coverImageUrl are allowed.' });
    }

    if (body.title !== undefined) {
      stream.title = String(body.title).slice(0, 200);
    }
    if (body.category !== undefined) {
      stream.category = String(body.category).slice(0, 50);
    }
    if (body.tags !== undefined) {
      const nt = normalizeTagsArray(body.tags);
      if (!nt.ok) {
        return reply.status(400).send({ error: 'INVALID_TAGS', message: 'tags must be an array of strings.' });
      }
      stream.tags = nt.tags;
    }
    if (body.scheduledAt !== undefined) {
      const prevMeta = stream.meta && typeof stream.meta === 'object' ? stream.meta : {};
      if (body.scheduledAt === null || body.scheduledAt === '') {
        stream.meta = { ...prevMeta, scheduledAt: null };
      } else {
        const d = new Date(body.scheduledAt);
        if (Number.isNaN(d.getTime())) {
          return reply.status(400).send({ error: 'INVALID_SCHEDULED_AT' });
        }
        stream.meta = { ...prevMeta, scheduledAt: d.toISOString() };
      }
    }
    if (body.coverImageUrl !== undefined) {
      if (body.coverImageUrl === null || body.coverImageUrl === '') {
        stream.thumbnailUrl = null;
      } else {
        const url = safeHttpUrl(body.coverImageUrl);
        if (!url) return reply.status(400).send({ error: 'INVALID_COVER_URL', message: 'coverImageUrl must be an http(s) URL.' });
        stream.thumbnailUrl = url;
      }
    }

    await stream.save();

    const isAdminEdit = String(stream.userId) !== String(user._id) && ['admin', 'mod', 'staff'].includes(user.role);
    if (isAdminEdit) {
      await writeAdminAuditLog({
        adminId: user._id,
        action: 'live_stream_metadata_update',
        targetType: 'LiveStream',
        targetId: String(stream._id),
        meta: { fields: Object.keys(body) },
      }).catch(() => {});
    }

    return reply.send(stream.toObject());
  });

  /* ── Create live event (LiveEvent model) ── */
  app.post('/live/events', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const body = request.body ?? {};
    const scheduledStart = body.scheduledStart || body.scheduled_start;
    if (!scheduledStart) return reply.status(400).send({ error: 'scheduled_start required' });

    const startDate = new Date(scheduledStart);
    if (isNaN(startDate.getTime())) return reply.status(400).send({ error: 'invalid scheduled_start' });
    if (startDate <= new Date()) return reply.status(400).send({ error: 'scheduled_start must be in the future' });

    const eventType = body.eventType || body.event_type || 'public';
    if (!EVENT_TYPES.includes(eventType)) return reply.status(400).send({ error: 'invalid event_type' });

    const ticketPriceCents = typeof (body.ticketPriceCents ?? body.ticket_price) === 'number'
      ? Math.max(0, Math.round(body.ticketPriceCents ?? body.ticket_price))
      : 0;

    const durationMinutes = typeof (body.durationMinutes ?? body.duration_minutes) === 'number'
      ? Math.max(1, Math.min(480, Math.round(body.durationMinutes ?? body.duration_minutes)))
      : 60;

    const notifyFollowers = body.notifyFollowers !== false;
    const event = await db.LiveEvent.create({
      creatorId: user._id,
      title: (body.title || '').toString().slice(0, 200),
      description: body.description != null ? String(body.description) : null,
      thumbnailUrl: body.thumbnailUrl || body.thumbnail || null,
      scheduledStart: startDate,
      durationMinutes,
      eventType,
      ticketPriceCents,
    });

    if (notifyFollowers) {
      const { notifyFollowersLiveEvent } = require('../services/liveNotification.service');
      notifyFollowersLiveEvent(event).catch((err) =>
        request.log.warn({ err, eventId: event._id }, 'Failed to notify followers of live event')
      );
    }

    return reply.send(event.toObject());
  });

  /* ── List upcoming live events ── */
  app.get('/live/events/upcoming', async (request, reply) => {
    const { limit = 50, creatorId } = request.query ?? {};
    const lim = Math.min(Math.max(1, Number(limit) || 50), 100);

    const query = {
      status: 'scheduled',
      scheduledStart: { $gte: new Date() },
    };
    if (creatorId) {
      if (!validateId(creatorId, reply)) return;
      query.creatorId = creatorId;
    }

    const events = await db.LiveEvent.find(query)
      .sort({ scheduledStart: 1 })
      .limit(lim)
      .lean();

    return reply.send(events);
  });

  /* ── Complete event and set replay URL (creator only) ── */
  app.patch('/live/events/:eventId', async (request, reply) => {
    if (!validateId(request.params.eventId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { eventId } = request.params;
    const event = await db.LiveEvent.findById(eventId);
    if (!event) return reply.status(404).send({ error: 'EVENT_NOT_FOUND' });
    if (!requireOwner(user, event.creatorId, reply)) return;

    const { status, replayUrl } = request.body ?? {};
    if (status !== undefined) {
      if (!['scheduled', 'live', 'completed', 'cancelled'].includes(status)) {
        return reply.status(400).send({ error: 'INVALID_STATUS' });
      }
      event.status = status;
    }
    if (replayUrl !== undefined) {
      event.replayUrl = typeof replayUrl === 'string' && replayUrl.trim()
        ? replayUrl.trim()
        : null;
    }
    await event.save();
    return reply.send(event.toObject());
  });

  /* ── List event replays (completed events with replayUrl) ── */
  app.get('/live/events/replays', async (request, reply) => {
    const { creatorId, limit = 20, offset = 0 } = request.query ?? {};
    const query = { status: 'completed', replayUrl: { $ne: null, $exists: true } };
    if (creatorId) {
      if (!validateId(creatorId, reply)) return;
      query.creatorId = creatorId;
    }
    const [events, total] = await Promise.all([
      db.LiveEvent.find(query)
        .sort({ scheduledStart: -1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 50))
        .lean(),
      db.LiveEvent.countDocuments(query),
    ]);
    return reply.send({ events, total });
  });

  /* ── Get single live event (for countdown page) ── */
  app.get('/live/events/:eventId', async (request, reply) => {
    if (!validateId(request.params.eventId, reply)) return;
    const event = await db.LiveEvent.findById(request.params.eventId)
      .populate('creatorId', 'displayName avatarUrl')
      .lean();
    if (!event) return reply.status(404).send({ error: 'EVENT_NOT_FOUND' });
    return reply.send(event);
  });

  /* ── Event ticket purchase (Stripe checkout for paid, direct for free) ── */
  app.post('/live/events/:eventId/ticket', async (request, reply) => {
    if (!validateId(request.params.eventId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const event = await db.LiveEvent.findById(request.params.eventId).lean();
    if (!event) return reply.status(404).send({ error: 'EVENT_NOT_FOUND' });
    if (event.status !== 'scheduled') return reply.status(400).send({ error: 'EVENT_NOT_SCHEDULED' });
    if (!['ticketed', 'public'].includes(event.eventType)) return reply.status(400).send({ error: 'EVENT_NOT_TICKETED' });

    const existing = await db.EventAttendance.findOne({ eventId: event._id, userId: user._id }).lean();
    if (existing) return reply.status(200).send({ attendance: existing, alreadyPurchased: true });

    if (event.ticketPriceCents === 0) {
      const attendance = await db.EventAttendance.create({
        eventId: event._id,
        userId: user._id,
        ticketPaid: false,
      });
      return reply.send(attendance.toObject());
    }

    const stripeBilling = require('@millo/billing/src/stripe');
    const baseUrl = process.env.FRONTEND_URL || 'https://milloapp.com';
    let result;
    try {
      result = await stripeBilling.createCheckout(
        event.ticketPriceCents / 100,
        'usd',
        { eventId: event._id.toString(), userId: user._id.toString() },
        {
          productName: event.title || 'Event Ticket',
          successUrl: `${baseUrl}/live/events/${event._id}?ticket=success`,
          cancelUrl: `${baseUrl}/live/events/${event._id}?ticket=cancelled`,
        }
      );
    } catch (err) {
      if (err.code === 'STRIPE_NOT_CONFIGURED' || err.statusCode === 503) {
        return reply.status(503).send({
          error: 'PAYMENTS_UNAVAILABLE',
          message: 'Ticket purchase is not available — payment provider is not configured.',
        });
      }
      throw err;
    }
    if (!result.url) return reply.status(500).send({ error: 'STRIPE_CHECKOUT_FAILED' });
    return reply.send({ url: result.url, sessionId: result.sessionId });
  });

  /* ── Event chat (REST fallback) ── */
  app.get('/live/events/:eventId/chat', async (request, reply) => {
    if (!validateId(request.params.eventId, reply)) return;
    const { eventId } = request.params;
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const before = request.query?.before;

    const event = await db.LiveEvent.findById(eventId).lean();
    if (!event) return reply.status(404).send({ error: 'EVENT_NOT_FOUND' });
    if (!['scheduled', 'live'].includes(event.status)) return reply.status(400).send({ error: 'EVENT_NOT_AVAILABLE' });

    const filter = { eventId, deletedAt: null };
    if (before) filter._id = { $lt: before };

    const messages = await db.EventComment.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const items = messages.reverse().map((m) => ({
      messageId: m._id.toString(),
      userId: m.userId?.toString(),
      displayName: m.displayName || 'Viewer',
      text: m.text,
      ts: m.createdAt?.getTime?.() || Date.now(),
    }));

    return reply.send({ messages: items });
  });

  app.post('/live/events/:eventId/chat', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    if (!validateId(request.params.eventId, reply)) return;

    const { eventId } = request.params;
    const { text } = request.body || {};
    if (!text || typeof text !== 'string') return reply.status(400).send({ error: 'TEXT_REQUIRED' });
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return reply.status(400).send({ error: 'TEXT_REQUIRED' });

    const event = await db.LiveEvent.findById(eventId).lean();
    if (!event) return reply.status(404).send({ error: 'EVENT_NOT_FOUND' });
    if (!['scheduled', 'live'].includes(event.status)) return reply.status(400).send({ error: 'EVENT_NOT_AVAILABLE' });

    const profile = await db.Profile.findOne({ userId: user._id }).lean().catch(() => null);
    const displayName = profile?.displayName || user.email?.split('@')[0] || 'Viewer';

    const comment = await db.EventComment.create({
      eventId,
      userId: user._id,
      displayName,
      text: trimmed,
    });

    const payload = {
      type: 'event_message',
      messageId: comment._id.toString(),
      userId: user._id.toString(),
      displayName,
      text: trimmed,
      ts: Date.now(),
    };
    liveChat.broadcastToRoom(liveChat.roomId('event', eventId), payload);

    return reply.status(201).send({ ok: true, message: payload });
  });

  /* ── Schedule stream (future start) ── */
  app.post('/live/schedule', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const body = request.body ?? {};
    const scheduledStart = body.scheduledStart || body.scheduled_start;
    if (!scheduledStart) return reply.status(400).send({ error: 'scheduled_start required' });

    const startDate = new Date(scheduledStart);
    if (isNaN(startDate.getTime())) return reply.status(400).send({ error: 'invalid scheduled_start' });
    if (startDate <= new Date()) return reply.status(400).send({ error: 'scheduled_start must be in the future' });

    const streamType = body.streamType || body.stream_type || 'standard';
    if (!STREAM_TYPES.includes(streamType)) return reply.status(400).send({ error: 'invalid stream_type' });

    const priceCents = typeof (body.priceCents ?? body.price) === 'number'
      ? Math.max(0, Math.round(body.priceCents ?? body.price))
      : 0;

    const isValidId = (id) => id && mongoose.Types.ObjectId.isValid(id);
    const productIds = Array.isArray(body.productIds) ? body.productIds.filter(isValidId) : [];
    const auctionIds = Array.isArray(body.auctionIds) ? body.auctionIds.filter(isValidId) : [];

    const stream = await db.ScheduledStream.create({
      creatorId: user._id,
      title: (body.title || '').toString().slice(0, 200),
      description: body.description != null ? String(body.description) : null,
      thumbnailUrl: body.thumbnailUrl || body.thumbnail || null,
      scheduledStart: startDate,
      streamType,
      priceCents,
      notifyFollowers: body.notifyFollowers !== false,
      productIds: productIds.slice(0, 20),
      auctionIds: auctionIds.slice(0, 10),
    });

    if (stream.notifyFollowers) {
      const { notifyFollowersScheduled } = require('../services/liveNotification.service');
      notifyFollowersScheduled(stream).catch((err) => request.log.warn({ err, streamId: stream._id }, 'Failed to notify followers of scheduled stream'));
    }

    return reply.send(stream.toObject());
  });

  /* ── List upcoming scheduled streams ── */
  app.get('/live/scheduled/upcoming', async (request, reply) => {
    const { limit = 20, creatorId } = request.query ?? {};
    const lim = Math.min(Math.max(1, Number(limit) || 20), 100);

    const query = {
      status: 'scheduled',
      scheduledStart: { $gte: new Date() },
    };
    if (creatorId) {
      if (!validateId(creatorId, reply)) return;
      query.creatorId = creatorId;
    }

    const streams = await db.ScheduledStream.find(query)
      .sort({ scheduledStart: 1 })
      .limit(lim)
      .lean();

    return reply.send(streams);
  });

  /* ── Calendar export (Google, iCal, Outlook) ── */
  app.get('/live/scheduled/:id/calendar', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const stream = await db.ScheduledStream.findById(request.params.id).lean();
    if (!stream) return reply.status(404).send({ error: 'SCHEDULED_STREAM_NOT_FOUND' });
    if (stream.status !== 'scheduled') return reply.status(400).send({ error: 'STREAM_NOT_SCHEDULED' });

    const format = (request.query.format || 'google').toLowerCase();
    const title = encodeURIComponent(stream.title || 'Live Stream');
    const desc = encodeURIComponent((stream.description || '').slice(0, 500));
    const start = new Date(stream.scheduledStart);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1hr default
    const dtStart = start.toISOString().replace(/[-:]/g, '').slice(0, 15);
    const dtEnd = end.toISOString().replace(/[-:]/g, '').slice(0, 15);
    const baseUrl = process.env.FRONTEND_URL || 'https://milloapp.com';

    if (format === 'google') {
      const url = `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${desc}&dates=${dtStart}/${dtEnd}&location=${encodeURIComponent(baseUrl + '/live/upcoming')}`;
      return reply.redirect(url, 302);
    }

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Millo//ScheduledStream//EN',
      'BEGIN:VEVENT',
      `UID:scheduled-${stream._id}@milloapp.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART:${dtStart}Z`,
      `DTEND:${dtEnd}Z`,
      `SUMMARY:${(stream.title || 'Live Stream').replace(/\n/g, ' ')}`,
      `DESCRIPTION:${(stream.description || '').replace(/\n/g, ' ').slice(0, 500)}`,
      `URL:${baseUrl}/live/upcoming`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    if (format === 'ical' || format === 'ics') {
      reply.header('Content-Type', 'text/calendar; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="millo-stream-${stream._id}.ics"`);
      return reply.send(ics);
    }

    if (format === 'outlook') {
      reply.header('Content-Type', 'text/calendar; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="millo-stream-${stream._id}.ics"`);
      return reply.send(ics);
    }

    return reply.send({
      google: `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${desc}&dates=${dtStart}/${dtEnd}`,
      ical: `${process.env.APP_URL || baseUrl}/live/scheduled/${stream._id}/calendar?format=ical`,
      outlook: `${process.env.APP_URL || baseUrl}/live/scheduled/${stream._id}/calendar?format=outlook`,
    });
  });

  app.post('/live/start', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    // userId in body is ignored — we use the authenticated identity
    const userId = user._id.toString();
    const {
      recordStreamGoLiveLatencyMs,
      incrementActiveStreams,
    } = require('./metrics');
    const goLiveStarted = Date.now();
    try {
      const stream = await live.startStream(userId, {
        title: request.body?.title,
        visibility: request.body?.visibility,
        category: request.body?.category,
      });

      // Create Janus WebRTC room for this stream
      try {
        const janusRoom = await janusService.createRoom(stream._id.toString(), {
          description: stream.title || `Stream by ${userId}`,
          maxPublishers: 6,
        });
        stream.janusRoomId = janusRoom.roomId;
      } catch (janusErr) {
        request.log.warn({ err: janusErr, streamId: stream._id }, 'Failed to create Janus room — WebRTC disabled');
      }

      recordStreamGoLiveLatencyMs(Date.now() - goLiveStarted);
      incrementActiveStreams();
      return reply.send(stream);
    } catch (e) {
      return reply.status(400).send({ error: e.message });
    }
  });

  app.post('/live/end/:streamId', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { streamId } = request.params;
    try {
      const existing = await db.LiveStream.findById(streamId).lean();
      if (!existing) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
      if (!isPrivileged(user, existing.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });

      // Destroy Janus WebRTC room
      await janusService.destroyRoom(streamId).catch((e) => {
        request.log.warn({ err: e, streamId }, 'Failed to destroy Janus room');
      });

      const stream = await live.endStream(streamId);
      try {
        const { decrementActiveStreams } = require('./metrics');
        decrementActiveStreams();
      } catch (_) { /* metrics optional */ }
      broadcastToStream(streamId, { type: 'stream_ended', streamId });
      getBroadcastStream()(streamId, { type: 'stream_ended', data: { streamId } });
      return reply.send(stream);
    } catch (e) {
      if (e.message === 'STREAM_NOT_FOUND') return reply.status(404).send({ error: e.message });
      return reply.status(400).send({ error: e.message });
    }
  });

  app.get('/live/streams/trending', async (request, reply) => {
    const liveRanking = require('../services/liveRanking.service');
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const category = request.query?.category;
    const visibility = request.query?.visibility;
    const lives = await liveRanking.getTrendingLives({ limit, category, visibility });
    const viewerCounts = await Promise.all(lives.map((s) => viewerCountRedis.get(s._id.toString()).then((c) => (c !== null ? c : s.viewerCount))));
    const list = lives.map((s, i) => {
      const { score, ...rest } = s;
      return { ...rest, score, viewerCount: viewerCounts[i] ?? rest.viewerCount };
    });
    return reply.send({ streams: list });
  });

  app.get('/live/stream/:streamId', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const stream = await live.getStream(request.params.streamId);
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    const viewerCountFromRedis = await viewerCountRedis.get(request.params.streamId);
    const viewerCount = viewerCountFromRedis !== null ? viewerCountFromRedis : await live.getViewerCount(request.params.streamId);
    const { streamKey, ...rest } = stream;
    return reply.send({ ...rest, viewerCount });
  });

  app.get('/live/stream/:streamId/key', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const { streamId } = request.params;
    const keyInfo = await live.getStreamKey(streamId);
    if (!keyInfo) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    const userId = request.user?._id?.toString();
    if (!userId || keyInfo.userId.toString() !== userId) return reply.status(403).send({ error: 'FORBIDDEN' });
    return reply.send({ streamKey: keyInfo.streamKey });
  });

  app.patch('/live/stream/:streamId', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { streamId } = request.params;
    const stream = await db.LiveStream.findById(streamId);
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (!isPrivileged(user, stream.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });

    const { title, category, tags, thumbnail, thumbnailUrl, language, meta, contentCategory, visibility, priceCents, featuredProductIds } = request.body ?? {};
    if (title !== undefined) stream.title = String(title).slice(0, 200);
    if (category !== undefined) stream.category = String(category).slice(0, 50);
    if (tags !== undefined) {
      const nt = normalizeTagsArray(tags);
      if (!nt.ok) return reply.status(400).send({ error: 'INVALID_TAGS', message: 'tags must be an array of strings.' });
      stream.tags = nt.tags;
    }
    if (thumbnail !== undefined || thumbnailUrl !== undefined) {
      const raw = thumbnail ?? thumbnailUrl;
      if (raw === null || raw === '') stream.thumbnailUrl = null;
      else {
        const u = safeHttpUrl(raw);
        if (!u) return reply.status(400).send({ error: 'INVALID_THUMBNAIL_URL', message: 'thumbnail must be an http(s) URL.' });
        stream.thumbnailUrl = u;
      }
    }
    if (language !== undefined) stream.language = language === null || language === '' ? null : String(language).slice(0, 16);
    if (contentCategory !== undefined && ['safe', 'mature', 'explicit'].includes(contentCategory)) stream.contentCategory = contentCategory;
    if (visibility !== undefined && ['public', 'private', 'paid'].includes(visibility)) stream.visibility = visibility;
    if (priceCents !== undefined && typeof priceCents === 'number' && priceCents >= 0) stream.priceCents = priceCents;
    if (meta !== undefined && meta !== null && typeof meta === 'object') {
      const keys = Object.keys(meta);
      if (keys.length > META_MERGE_MAX_KEYS) {
        return reply.status(400).send({
          error: 'META_TOO_LARGE',
          message: `meta may include at most ${META_MERGE_MAX_KEYS} keys.`,
        });
      }
      stream.meta = { ...(stream.meta && typeof stream.meta === 'object' ? stream.meta : {}), ...meta };
    }
    if (Array.isArray(featuredProductIds)) {
      const mongoose = require('mongoose');
      const MAX_LIVE_FEATURED = 20;
      const ids = featuredProductIds
        .slice(0, MAX_LIVE_FEATURED)
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const owned = ids.length > 0
        ? await db.Product.find({ _id: { $in: ids }, creatorId: stream.userId, status: 'active' }).select('_id').lean()
        : [];
      stream.featuredProductIds = owned.map((p) => p._id);
    }

    await stream.save();

    const isAdminPatch = String(stream.userId) !== String(user._id) && ['admin', 'mod', 'staff'].includes(user.role);
    if (isAdminPatch) {
      await writeAdminAuditLog({
        adminId: user._id,
        action: 'live_stream_patch',
        targetType: 'LiveStream',
        targetId: String(stream._id),
        meta: { keys: Object.keys(request.body ?? {}) },
      }).catch(() => {});
    }

    return reply.send(stream.toObject());
  });

  /* ── Creator-appointed moderators (stream owner or admin) ── */
  app.get('/live/stream/:streamId/moderators', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    const stream = await db.LiveStream.findById(request.params.streamId).select('userId').lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (!isPrivileged(user, stream.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });
    const list = await db.StreamModerator.find({ creatorId: stream.userId }).populate('moderatorId', 'email displayName').lean();
    return reply.send({ moderators: list });
  });

  app.post('/live/stream/:streamId/moderators', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    const stream = await db.LiveStream.findById(request.params.streamId).select('userId').lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (String(stream.userId) !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN' });
    const moderatorId = request.body?.moderatorId || request.body?.userId;
    if (!validateId(moderatorId, reply)) return;
    if (String(moderatorId) === String(user._id)) return reply.status(400).send({ error: 'CANNOT_ADD_SELF_AS_MODERATOR' });
    const existing = await db.StreamModerator.findOne({ creatorId: stream.userId, moderatorId });
    if (existing) return reply.status(200).send(existing.toObject());
    const doc = await db.StreamModerator.create({ creatorId: stream.userId, moderatorId });
    return reply.status(201).send(doc.toObject());
  });

  app.delete('/live/stream/:streamId/moderators/:userId', async (request, reply) => {
    if (!validateId(request.params.streamId, reply) || !validateId(request.params.userId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    const stream = await db.LiveStream.findById(request.params.streamId).select('userId').lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (String(stream.userId) !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN' });
    await db.StreamModerator.deleteOne({ creatorId: stream.userId, moderatorId: request.params.userId });
    return reply.send({ ok: true });
  });

  /* ── Device analytics (creator only) ── */
  app.get('/live/stream/:streamId/device-analytics', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { streamId } = request.params;
    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (!isPrivileged(user, stream.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });

    const { limit = 500 } = request.query ?? {};
    const lim = Math.min(Number(limit), 1000);

    const [raw, deviceMetrics] = await Promise.all([
      db.DeviceAnalytics.find({ streamId }).sort({ createdAt: -1 }).limit(lim).lean(),
      db.LiveDeviceMetrics.find({ streamId }).sort({ createdAt: -1 }).limit(100).lean(),
    ]);

    const byDevice = { mobile: 0, desktop: 0, tablet: 0 };
    const byOs = {};
    const byBrowser = {};
    for (const r of raw) {
      byDevice[r.device || 'desktop'] = (byDevice[r.device || 'desktop'] || 0) + 1;
      if (r.os) byOs[r.os] = (byOs[r.os] || 0) + 1;
      if (r.browser) byBrowser[r.browser] = (byBrowser[r.browser] || 0) + 1;
    }

    return reply.send({
      streamId,
      total: raw.length,
      byDevice,
      byOs,
      byBrowser,
      recent: raw.slice(0, 50),
      deviceMetrics: deviceMetrics.slice(0, 50),
    });
  });

  /* ── Generic co-host: request to join as co-host (broadcasts to stream room) ── */
  app.post('/live/cohost/request', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const streamId = request.body?.streamId || request.body?.stream_id;
    if (!streamId) return reply.status(400).send({ error: 'streamId required' });
    if (!validateId(streamId, reply)) return;

    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (stream.status !== 'live') return reply.status(400).send({ error: 'STREAM_NOT_LIVE' });

    broadcastToStream(streamId, {
      type: 'cohost_request',
      userId: String(user._id),
      user_id: String(user._id),
    });
    getBroadcastStream()(streamId, { type: 'cohost_request', data: { userId: String(user._id) } });

    return reply.send({ success: true });
  });

  /* ── Co-Host API (Phase 4): invite, accept, remove. Janus: create subscriber feed (stub). ── */
  app.post('/live/cohost/invite', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    const { streamId, userId: inviteeId } = request.body || {};
    if (!streamId || !inviteeId) return reply.status(400).send({ error: 'streamId and userId required' });
    if (!validateId(streamId, reply) || !validateId(inviteeId, reply)) return;
    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (stream.status !== 'live') return reply.status(400).send({ error: 'STREAM_NOT_LIVE' });
    if (!isPrivileged(user, stream.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });
    const existing = await db.CoHostInvite.findOne({ streamId, inviteeId, status: 'pending' }).lean();
    if (existing) return reply.send({ ok: true, inviteId: existing._id, message: 'Invite already pending' });
    const invite = await db.CoHostInvite.create({
      streamId,
      inviterId: user._id,
      inviteeId,
      status: 'pending',
    });
    kafka.publish(kafka.TOPICS.LIVE_EVENTS, {
      event: 'cohost.invite',
      streamId: String(streamId),
      inviterId: String(user._id),
      inviteeId: String(inviteeId),
      inviteId: String(invite._id),
    }).catch(() => {});
    getBroadcastStream()(streamId, { type: 'cohost_invite', data: { inviteId: invite._id.toString(), streamId, inviterId: String(user._id), inviteeId: String(inviteeId) } });
    return reply.status(201).send({ ok: true, inviteId: invite._id });
  });

  app.post('/live/cohost/accept', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    const { streamId, inviteId } = request.body || {};
    if (!streamId) return reply.status(400).send({ error: 'streamId required' });
    if (!validateId(streamId, reply)) return;
    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (stream.status !== 'live') return reply.status(400).send({ error: 'STREAM_NOT_LIVE' });
    const query = inviteId ? { _id: inviteId, streamId, inviteeId: user._id, status: 'pending' } : { streamId, inviteeId: user._id, status: 'pending' };
    const invite = await db.CoHostInvite.findOne(query).sort({ createdAt: -1 });
    if (!invite) return reply.status(404).send({ error: 'INVITE_NOT_FOUND' });
    invite.status = 'accepted';
    await invite.save();
    const coHosts = [...(stream.meta?.coHosts || []).map(String), String(user._id)];
    await db.LiveStream.updateOne(
      { _id: streamId },
      { $set: { 'meta.coHosts': [...new Set(coHosts)], updatedAt: new Date() } }
    );
    const janusStub = require('../lib/janusStub');
    janusStub.createSubscriberFeed(streamId, String(user._id)).catch(() => {});
    kafka.publish(kafka.TOPICS.LIVE_EVENTS, {
      event: 'cohost.accept',
      streamId: String(streamId),
      userId: String(user._id),
      inviteId: String(invite._id),
    }).catch(() => {});
    broadcastToStream(streamId, { type: 'cohost_accepted', data: { userId: String(user._id), streamId } });
    getBroadcastStream()(streamId, { type: 'cohost_accepted', data: { userId: String(user._id), streamId } });
    return reply.send({ ok: true, streamId });
  });

  app.post('/live/cohost/reject', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    const { streamId, inviteId } = request.body || {};
    if (!streamId) return reply.status(400).send({ error: 'streamId required' });
    if (!validateId(streamId, reply)) return;
    const query = inviteId ? { _id: inviteId, streamId, inviteeId: user._id, status: 'pending' } : { streamId, inviteeId: user._id, status: 'pending' };
    const invite = await db.CoHostInvite.findOne(query).sort({ createdAt: -1 });
    if (!invite) return reply.status(404).send({ error: 'INVITE_NOT_FOUND' });
    invite.status = 'rejected';
    await invite.save();
    return reply.send({ ok: true, streamId, inviteId: invite._id });
  });

  app.post('/live/cohost/remove', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    const { streamId, userId: targetUserId } = request.body || {};
    if (!streamId || !targetUserId) return reply.status(400).send({ error: 'streamId and userId required' });
    if (!validateId(streamId, reply) || !validateId(targetUserId, reply)) return;
    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (!isPrivileged(user, stream.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });
    const coHosts = ((stream.meta?.coHosts || []).map(String)).filter((id) => id !== String(targetUserId));
    await db.LiveStream.updateOne(
      { _id: streamId },
      { $set: { 'meta.coHosts': coHosts, updatedAt: new Date() } }
    );
    kafka.publish(kafka.TOPICS.LIVE_EVENTS, {
      event: 'cohost.remove',
      streamId: String(streamId),
      userId: String(targetUserId),
      removedBy: String(user._id),
    }).catch(() => {});
    broadcastToStream(streamId, { type: 'cohost_removed', data: { userId: String(targetUserId), streamId } });
    getBroadcastStream()(streamId, { type: 'cohost_removed', data: { userId: String(targetUserId), streamId } });
    return reply.send({ ok: true, streamId });
  });

  /* ══════════════════════════════════════════════════════════════════════════════
   *  JANUS WEBRTC SIGNALING ROUTES
   *  Handles WebRTC connection establishment for publishers and subscribers.
   * ══════════════════════════════════════════════════════════════════════════════ */

  /**
   * Create Janus session + VideoRoom handle (client then sends `create`/`join` via Janus API).
   * POST /live/webrtc/live-room
   */
  app.post('/live/webrtc/live-room', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    try {
      const sessionId = await streamService.createSession();
      const handleId = await streamService.attachPlugin(sessionId);
      return reply.send({
        ok: true,
        sessionId,
        handleId,
        roomId: Date.now(),
      });
    } catch (e) {
      request.log.error({ err: e }, 'createLiveRoom failed');
      const msg = e.message || 'JANUS_UNAVAILABLE';
      const status = /JANUS_NOT_CONFIGURED/i.test(msg) ? 503 : 502;
      return reply.status(status).send({ error: msg });
    }
  });

  /**
   * Get WebRTC room info for a stream.
   * GET /live/stream/:streamId/webrtc/info
   */
  app.get('/live/stream/:streamId/webrtc/info', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const { streamId } = request.params;

    try {
      const info = await janusService.getRoomInfo(streamId);
      return reply.send({
        ok: true,
        configured: janusService.isConfigured(),
        ...info,
      });
    } catch (e) {
      return reply.status(400).send({ error: e.message });
    }
  });

  /**
   * Join WebRTC room as publisher (creator or co-host).
   * POST /live/stream/:streamId/webrtc/publish
   * Body: { displayName?: string }
   */
  app.post('/live/stream/:streamId/webrtc/publish', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { streamId } = request.params;
    const { displayName } = request.body || {};

    try {
      const stream = await db.LiveStream.findById(streamId).lean();
      if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });

      // Only creator or co-hosts can publish
      const isCreator = String(stream.userId) === String(user._id);
      const isCoHost = (stream.meta?.coHosts || []).map(String).includes(String(user._id));
      if (!isCreator && !isCoHost) {
        return reply.status(403).send({ error: 'NOT_AUTHORIZED_TO_PUBLISH' });
      }

      const result = await janusService.joinAsPublisher(
        streamId,
        String(user._id),
        displayName || user.displayName || user.email?.split('@')[0] || 'Publisher'
      );

      return reply.send({
        ok: true,
        feed: result.feed,
        sessionId: result.sessionId,
        handleId: result.handleId,
        publishers: result.publishers,
        jsep: result.jsep,
      });
    } catch (e) {
      request.log.error({ err: e, streamId }, 'WebRTC publish join failed');
      return reply.status(400).send({ error: e.message });
    }
  });

  /**
   * Configure publisher with SDP offer.
   * POST /live/stream/:streamId/webrtc/configure
   * Body: { sessionId, handleId, jsep: { type, sdp }, audio?, video?, bitrate? }
   */
  app.post('/live/stream/:streamId/webrtc/configure', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { sessionId, handleId, jsep, audio, video, bitrate } = request.body || {};
    if (!sessionId || !handleId || !jsep) {
      return reply.status(400).send({ error: 'sessionId, handleId, and jsep required' });
    }

    try {
      const result = await janusService.configurePublisher(sessionId, handleId, jsep, {
        audio: audio !== false,
        video: video !== false,
        bitrate: bitrate || 512000,
      });

      return reply.send({
        ok: true,
        configured: result.configured,
        jsep: result.jsep,
      });
    } catch (e) {
      request.log.error({ err: e }, 'WebRTC configure failed');
      return reply.status(400).send({ error: e.message });
    }
  });

  /**
   * Subscribe to a publisher's stream.
   * POST /live/stream/:streamId/webrtc/subscribe
   * Body: { feedId: number }
   */
  app.post('/live/stream/:streamId/webrtc/subscribe', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    const { streamId } = request.params;
    const { feedId } = request.body || {};

    if (!feedId) {
      return reply.status(400).send({ error: 'feedId required' });
    }

    try {
      const stream = await db.LiveStream.findById(streamId).lean();
      if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });

      // Check PPV access if applicable
      if (stream.visibility === 'paid' && user) {
        const ppv = require('@millo/ppv');
        const hasAccess = await ppv.unlockService.hasAccess(String(user._id), streamId);
        if (!hasAccess) {
          return reply.status(402).send({
            error: 'PPV_PURCHASE_REQUIRED',
            message: 'Purchase required to watch this stream.',
          });
        }
      }

      const userId = user ? String(user._id) : `anon_${Date.now()}`;
      const result = await janusService.joinAsSubscriber(streamId, userId, feedId);

      return reply.send({
        ok: true,
        sessionId: result.sessionId,
        handleId: result.handleId,
        jsep: result.jsep,
      });
    } catch (e) {
      request.log.error({ err: e, streamId }, 'WebRTC subscribe failed');
      return reply.status(400).send({ error: e.message });
    }
  });

  /**
   * Start receiving stream as subscriber.
   * POST /live/stream/:streamId/webrtc/start
   * Body: { sessionId, handleId, jsep }
   */
  app.post('/live/stream/:streamId/webrtc/start', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;

    const { sessionId, handleId, jsep } = request.body || {};
    if (!sessionId || !handleId || !jsep) {
      return reply.status(400).send({ error: 'sessionId, handleId, and jsep required' });
    }

    try {
      const result = await janusService.startSubscriber(sessionId, handleId, jsep);
      return reply.send({ ok: true, started: result.started });
    } catch (e) {
      request.log.error({ err: e }, 'WebRTC start failed');
      return reply.status(400).send({ error: e.message });
    }
  });

  /**
   * Leave WebRTC room (cleanup session).
   * POST /live/stream/:streamId/webrtc/leave
   * Body: { sessionId }
   */
  app.post('/live/stream/:streamId/webrtc/leave', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;

    const { streamId } = request.params;
    const { sessionId } = request.body || {};
    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId required' });
    }

    try {
      const user = await authUser(request);
      if (user) {
        await janusService.removePublisher(streamId, String(user._id)).catch(() => {});
      }
      await janusService.destroySession(sessionId);
      return reply.send({ ok: true });
    } catch (e) {
      return reply.status(400).send({ error: e.message });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════════
   *  END JANUS WEBRTC SIGNALING ROUTES
   * ══════════════════════════════════════════════════════════════════════════════ */

  app.post('/live/join', async (request, reply) => {
    const { streamId, userId: bodyUserId, anonymousId, device, os, browser } = request.body || {};
    if (!streamId) return reply.status(400).send({ error: 'streamId required' });
    const reqUser = await authUser(request);
    const userId = bodyUserId || (reqUser && reqUser._id);
    try {
      const stream = await db.LiveStream.findById(streamId).lean();
      if (stream && stream.visibility === 'paid') {
        if (!userId) return reply.status(401).send({ error: 'PPV_REQUIRES_AUTH', message: 'Sign in to purchase and watch this paid stream.' });
        const ppv = require('@millo/ppv');
        const hasAccess = await ppv.unlockService.hasAccess(userId, streamId);
        if (!hasAccess) {
          return reply.status(402).send({
            error: 'PPV_PURCHASE_REQUIRED',
            message: 'Purchase required to watch this stream.',
            streamId,
            priceCents: stream.priceCents,
            unlockUrl: `/ppv/stream/${streamId}/unlock`,
          });
        }
      }
      const viewer = await live.joinViewer(streamId, { userId, anonymousId });
      const countFromRedis = await viewerCountRedis.incr(streamId);
      const count = countFromRedis >= 0 ? countFromRedis : await live.getViewerCount(streamId);
      kafka.publish(kafka.TOPICS.LIVE_EVENTS, {
        event: 'viewer.join',
        streamId: String(streamId),
        viewerId: String(viewer._id || ''),
        userId: userId ? String(userId) : null,
        viewerCount: count,
      }).catch(() => {});
      broadcastToStream(streamId, { type: 'viewer_count', count });
      getBroadcastStream()(streamId, { type: 'viewer_count', data: { streamId, count } });
      // Device analytics — fire-and-forget
      const validDevice = ['mobile', 'desktop', 'tablet'].includes(device) ? device : 'desktop';
      db.DeviceAnalytics.create({
        streamId,
        device: validDevice,
        os: typeof os === 'string' ? os.slice(0, 100) : null,
        browser: typeof browser === 'string' ? browser.slice(0, 100) : null,
      }).catch(() => {});
      // Live stream bot detection: if viewer join rate > threshold, flag stream (fire-and-forget)
      liveStreamBotDetection.getViewerJoinRate(streamId).then((r) => {
        if (r.ratePerMinute > liveStreamBotDetection.getViewerJoinRateThreshold()) {
          return liveStreamBotDetection.flagStream(streamId);
        }
      }).catch(() => {});
      return reply.send({ ...viewer, viewerCount: count });
    } catch (e) {
      if (e.message === 'STREAM_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'STREAM_NOT_LIVE') return reply.status(400).send({ error: e.message });
      return reply.status(400).send({ error: e.message });
    }
  });

  app.post('/live/stream/:streamId/heartbeat', async (request, reply) => {
    const { streamId } = request.params;
    const { viewerId } = request.body || {};
    if (!viewerId) return reply.status(400).send({ error: 'viewerId required' });
    try {
      const viewer = await live.recordHeartbeat(streamId, viewerId);
      return reply.send(viewer);
    } catch (e) {
      if (e.message === 'VIEWER_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'VIEWER_NOT_IN_STREAM' || e.message === 'VIEWER_ALREADY_LEFT') return reply.status(400).send({ error: e.message });
      return reply.status(400).send({ error: e.message });
    }
  });

  app.post('/live/leave', async (request, reply) => {
    const { viewerId } = request.body || {};
    if (!viewerId) return reply.status(400).send({ error: 'viewerId required' });
    try {
      const viewer = await live.leaveViewer(viewerId);
      const streamIdStr = viewer.streamId.toString();
      const countAfterDecr = await viewerCountRedis.decr(streamIdStr);
      const count = countAfterDecr >= 0 ? countAfterDecr : await live.getViewerCount(streamIdStr);
      kafka.publish(kafka.TOPICS.LIVE_EVENTS, {
        event: 'viewer.leave',
        streamId: streamIdStr,
        viewerId: String(viewer._id || viewerId),
        userId: viewer.userId ? String(viewer.userId) : null,
        viewerCount: count,
      }).catch(() => {});
      broadcastToStream(viewer.streamId, { type: 'viewer_count', count });
      getBroadcastStream()(streamIdStr, { type: 'viewer_count', data: { streamId: streamIdStr, count } });
      return reply.send({ ...viewer, viewerCount: count });
    } catch (e) {
      if (e.message === 'VIEWER_NOT_FOUND') return reply.status(404).send({ error: e.message });
      return reply.status(400).send({ error: e.message });
    }
  });

  /* ── Device analytics: latency, fps, packet loss, resolution + bitrate, droppedFrames, connectionQuality, deviceType. Client sends every ~5s. ── */
  app.post('/live/metrics', async (request, reply) => {
    const {
      streamId,
      viewerId,
      latency,
      fps,
      packetLoss,
      resolution,
      sessionId,
      bitrate,
      droppedFrames,
      connectionQuality,
      deviceType,
    } = request.body || {};
    if (!streamId) return reply.status(400).send({ error: 'streamId required' });
    if (!validateId(streamId, reply)) return;
    const stream = await db.LiveStream.findById(streamId).select('_id status').lean();
    if (!stream || stream.status !== 'live') return reply.status(400).send({ error: 'STREAM_NOT_LIVE' });
    const metricsDoc = {
      streamId,
      viewerId: viewerId && mongoose.Types.ObjectId.isValid(viewerId) ? viewerId : undefined,
      sessionId: typeof sessionId === 'string' ? sessionId.slice(0, 128) : undefined,
      latency: typeof latency === 'number' && !Number.isNaN(latency) ? latency : undefined,
      fps: typeof fps === 'number' && !Number.isNaN(fps) ? fps : undefined,
      packetLoss: typeof packetLoss === 'number' && !Number.isNaN(packetLoss) ? packetLoss : undefined,
      resolution: typeof resolution === 'string' ? resolution.trim().slice(0, 64) : undefined,
    };
    db.LiveStreamMetrics.create(metricsDoc).catch(() => {});
    const deviceDoc = {
      streamId,
      viewerId: viewerId && mongoose.Types.ObjectId.isValid(viewerId) ? viewerId : undefined,
      sessionId: typeof sessionId === 'string' ? sessionId.slice(0, 128) : undefined,
      deviceType: typeof deviceType === 'string' ? deviceType.trim().slice(0, 32) : undefined,
      bitrate: typeof bitrate === 'number' && !Number.isNaN(bitrate) ? bitrate : undefined,
      droppedFrames: typeof droppedFrames === 'number' && !Number.isNaN(droppedFrames) ? droppedFrames : undefined,
      connectionQuality: typeof connectionQuality === 'string' ? connectionQuality.trim().slice(0, 32) : undefined,
      latency: typeof latency === 'number' && !Number.isNaN(latency) ? latency : undefined,
      fps: typeof fps === 'number' && !Number.isNaN(fps) ? fps : undefined,
      resolution: typeof resolution === 'string' ? resolution.trim().slice(0, 64) : undefined,
    };
    if (deviceDoc.deviceType || deviceDoc.bitrate != null || deviceDoc.droppedFrames != null || deviceDoc.connectionQuality) {
      db.LiveDeviceMetrics.create(deviceDoc).catch(() => {});
    }
    return reply.send({ ok: true });
  });

  app.post('/live/moderate', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { streamId, action } = request.body || {};
    if (!streamId || !action) {
      return reply.status(400).send({ error: 'streamId and action required' });
    }
    if (!validateId(streamId, reply)) return;
    // Only the stream owner or a privileged role may moderate
    const existing = await db.LiveStream.findById(streamId).lean()
      .catch((e) => { request.log.error({ e, streamId }, 'DB error fetching stream for moderation'); return null; });
    if (!existing) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (!isPrivileged(user, existing.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });

    try {
      const result = await live.moderateStream(streamId, user._id.toString(), action, request.body?.meta || {});
      broadcastToStream(streamId, { type: 'moderation', action });
      return reply.send(result);
    } catch (e) {
      if (e.message === 'STREAM_NOT_FOUND') return reply.status(404).send({ error: e.message });
      return reply.status(400).send({ error: e.message });
    }
  });

  app.get('/live/filters/status', async (_request, reply) => {
    return reply.send({ enabled: getFiltersEnabled() });
  });

  app.get('/live/filters/list', async (_request, reply) => {
    const registryFilters = live.getAvailableFiltersWithVersions?.() ?? live.getAvailableFilters().map((id) => ({ id, version: '1.0' }));
    const dbFilters = await db.LiveFilter.find({ is_active: true }).lean().catch(() => []);
    const merged = registryFilters.map((r) => ({ id: r.id, version: r.version }));
    for (const f of dbFilters) {
      if (!merged.some((m) => m.id === f.name && m.version === f.version)) {
        merged.push({ id: f.name, version: f.version });
      }
    }
    return reply.send({ filterIds: [...new Set(merged.map((m) => m.id))], filters: merged });
  });

  /* ── Resolve filter by name + version (for stable recordings) ── */
  app.get('/live/filters/:name', async (request, reply) => {
    const { name } = request.params;
    const { version } = request.query ?? {};
    const query = version ? { name, version } : { name, is_active: true };
    const filter = await db.LiveFilter.findOne(query)
      .sort(version ? {} : { version: -1 })
      .lean();
    if (filter) return reply.send(filter);
    const resolved = live.resolveFilter?.(name, version || undefined);
    if (resolved) return reply.send({ name: resolved.id, version: resolved.version, is_active: true });
    return reply.status(404).send({ error: 'FILTER_NOT_FOUND', name, version: version || null });
  });

  /* ── Generic co-host: any user can request to join as co-host ── */
  app.post('/live/stream/:streamId/cohost/request', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { streamId } = request.params;
    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (stream.status !== 'live') return reply.status(400).send({ error: 'STREAM_NOT_LIVE', message: 'Stream is not live' });

    const profile = await db.Profile.findOne({ userId: user._id }).select('displayName').lean().catch(() => null);
    const displayName = profile?.displayName || user.email?.split('@')[0] || 'User';

    broadcastToStream(streamId, {
      type: 'cohost_request',
      streamId,
      userId: user._id.toString(),
      displayName,
    });

    return reply.send({ success: true, streamId });
  });

  app.post('/live/milla/cohost', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { streamId, enabled } = request.body || {};
    if (streamId == null) return reply.status(400).send({ error: 'streamId required' });
    if (!validateId(streamId, reply)) return;

    const existing = await db.LiveStream.findById(streamId).lean()
      .catch((e) => { request.log.error({ e, streamId }, 'DB error fetching stream for cohost'); return null; });
    if (!existing) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (!isPrivileged(user, existing.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });

    milla.setCoHost(streamId, !!enabled);
    return reply.send({ ok: true, streamId, coHost: !!enabled });
  });

  app.post('/live/milla/mute', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { streamId, muted } = request.body || {};
    if (streamId == null) return reply.status(400).send({ error: 'streamId required' });
    if (!validateId(streamId, reply)) return;

    const existing = await db.LiveStream.findById(streamId).lean()
      .catch((e) => { request.log.error({ e, streamId }, 'DB error fetching stream for mute'); return null; });
    if (!existing) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (!isPrivileged(user, existing.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });

    if (muted) milla.forceMute(streamId);
    else milla.forceUnmute(streamId);
    return reply.send({ ok: true, streamId, muted: !!muted });
  });

  app.get('/live/milla/status/:streamId', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const { streamId } = request.params;
    const { getCapabilities } = require('../config/capabilities');
    return reply.send({
      coHost: milla.isCoHost(streamId),
      muted: milla.isMuted(streamId),
      millaEnabled: milla.millaEnabled(),
      millaCapabilities: getCapabilities().milla,
    });
  });

  /* ── AI chat participation — MILLA replies to chat messages ── */
  app.post('/live/milla/chat/reply', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { message, streamId, systemPrompt } = request.body ?? {};
    if (!message?.trim()) return reply.status(400).send({ error: 'MESSAGE_REQUIRED' });
    if (streamId && !validateId(streamId, reply)) return;

    try {
      const aiReply = await milla.generateReply(message.trim(), { streamId, systemPrompt });
      return reply.send(aiReply);
    } catch (e) {
      if (e.message === 'MILLA_DISABLED') {
        return reply.status(503).send({ error: 'MILLA_DISABLED', message: 'AI chat is not enabled.' });
      }
      if (e.message === 'MESSAGE_REQUIRED') {
        return reply.status(400).send({ error: e.message });
      }
      if (e.message === 'OPENAI_API_KEY_REQUIRED') {
        return reply.status(503).send({ error: 'OPENAI_API_KEY_REQUIRED', message: 'AI chat is not configured.' });
      }
      request.log.warn({ err: e }, 'MILLA chat reply error');
      return reply.status(502).send({ error: 'AI_CHAT_ERROR', message: e.message });
    }
  });

  app.post('/live/milla/gift', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;

    const { streamId, gift } = request.body || {};
    if (!streamId) return reply.status(400).send({ error: 'streamId required' });
    try {
      const reaction = await milla.onGift(streamId, gift || {});
      return reply.send({ ok: true, reaction });
    } catch (e) {
      return reply.status(400).send({ error: e.message });
    }
  });

  /* ── Live chat (persisted + broadcast) ── */
  app.post('/live/stream/:streamId/chat', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    if (!validateId(request.params.streamId, reply)) return;

    const { streamId } = request.params;
    const { text } = request.body || {};
    if (!text || typeof text !== 'string') return reply.status(400).send({ error: 'TEXT_REQUIRED' });
    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return reply.status(400).send({ error: 'TEXT_REQUIRED' });

    const chatFilter = require('../services/moderation/chatFilter');
    const allowed = await chatFilter.filterChat(trimmed);
    if (!allowed) return reply.status(400).send({ error: 'CHAT_FILTERED', message: 'Message contains disallowed content.' });

    const millaModeration = require('../services/millaModeration');
    if (millaModeration.isEnabled()) {
      const modResult = await millaModeration.moderateLivestreamText(trimmed).catch(() => ({ allowed: true }));
      if (!modResult.allowed) return reply.status(400).send({ error: 'CONTENT_BLOCKED', message: 'Message blocked by moderation.' });
    }

    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (stream.status !== 'live') return reply.status(400).send({ error: 'STREAM_NOT_LIVE' });

    const profile = await db.Profile.findOne({ userId: user._id }).lean().catch(() => null);
    const displayName = profile?.displayName || user.email?.split('@')[0] || 'Viewer';

    const comment = await db.StreamComment.create({
      streamId,
      userId: user._id,
      displayName,
      text: trimmed,
    });

    const payload = {
      type: 'chat',
      messageId: comment._id.toString(),
      userId: user._id.toString(),
      displayName,
      text: trimmed,
      ts: Date.now(),
    };
    broadcastToStream(streamId, payload);
    getBroadcastStream()(streamId, { type: 'chat', data: payload });

    if (process.env.LIVE_CHAT_KAFKA !== 'false') {
      const { publishLiveChatMessage } = require('../lib/liveEventsKafka');
      publishLiveChatMessage({
        streamId,
        userId: user._id.toString(),
        displayName,
        text: trimmed,
        messageId: payload.messageId,
        ts: payload.ts,
        source: 'rest',
      });
    }

    return reply.status(201).send({ ok: true, message: payload });
  });

  app.get('/live/stream/:streamId/chat', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const { streamId } = request.params;
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const before = request.query?.before;

    const filter = { streamId, deletedAt: null };
    if (before) filter._id = { $lt: before };

    const messages = await db.StreamComment.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const items = messages.reverse().map((m) => ({
      messageId: m._id.toString(),
      userId: m.userId?.toString(),
      displayName: m.displayName || 'Viewer',
      text: m.text,
      ts: m.createdAt?.getTime?.() || Date.now(),
    }));

    return reply.send({ messages: items });
  });

  /* ── Aggregated emoji reaction counts (Redis) ── */
  app.get('/live/stream/:streamId/reactions', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const { streamId } = request.params;
    const { getCounts } = require('../lib/reactionCounters');
    const counts = await getCounts(streamId);
    return reply.send({ streamId, reactions: counts });
  });

  /* ── Real-time gift leaderboard (Redis ZINCRBY) ── */
  app.get('/live/stream/:streamId/leaderboard', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const { streamId } = request.params;
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const { getTop } = require('../lib/giftLeaderboard');
    const top = await getTop(streamId, limit);
    const userIds = top.map((t) => t.userId).filter(Boolean);
    let profiles = [];
    if (userIds.length > 0) {
      profiles = await db.Profile.find({ userId: { $in: userIds } }).select('userId displayName avatarUrl').lean();
    }
    const profileMap = Object.fromEntries((profiles || []).map((p) => [String(p.userId), p]));
    const leaderboard = top.map((t, i) => ({
      rank: i + 1,
      userId: t.userId,
      coins: t.coins,
      displayName: profileMap[t.userId]?.displayName || null,
      avatarUrl: profileMap[t.userId]?.avatarUrl || null,
    }));
    return reply.send({ streamId, leaderboard });
  });

  /* ── Chat word filter: list/add/remove banned words (admin) ── */
  app.get('/live/moderation/chat-banned', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const chatFilter = require('../services/moderation/chatFilter');
    const words = await chatFilter.getBannedWords();
    return reply.send({ words });
  });

  app.post('/live/moderation/chat-banned', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { word } = request.body || {};
    if (!word || typeof word !== 'string') return reply.status(400).send({ error: 'word required' });
    const chatFilter = require('../services/moderation/chatFilter');
    const ok = await chatFilter.addBannedWord(word);
    return reply.send({ ok, word: String(word).trim().toLowerCase() });
  });

  app.delete('/live/moderation/chat-banned', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { word } = request.body || request.query || {};
    if (!word || typeof word !== 'string') return reply.status(400).send({ error: 'word required' });
    const chatFilter = require('../services/moderation/chatFilter');
    await chatFilter.removeBannedWord(word);
    return reply.send({ ok: true });
  });

  /* ── Moderation state (mute chat, disable reactions, block gifts) ── */
  app.get('/live/stream/:streamId/moderation', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const { streamId } = request.params;
    const streamModeration = require('../lib/streamModeration');
    const state = await streamModeration.get(streamId);
    return reply.send({ streamId, ...state });
  });

  /* ── Delete chat message (stream owner or mod) ── */
  app.delete('/live/stream/:streamId/chat/:messageId', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    if (!validateId(request.params.streamId, reply) || !validateId(request.params.messageId, reply)) return;

    const { streamId, messageId } = request.params;
    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (!isPrivileged(user, stream.userId)) return reply.status(403).send({ error: 'FORBIDDEN' });

    const comment = await db.StreamComment.findOne({ _id: messageId, streamId });
    if (!comment) return reply.status(404).send({ error: 'MESSAGE_NOT_FOUND' });

    comment.deletedAt = new Date();
    comment.deletedBy = user._id;
    await comment.save();

    broadcastToStream(streamId, { type: 'chat_delete', messageId });
    getBroadcastStream()(streamId, { type: 'chat_delete', data: { messageId } });

    await db.ModerationLog.create({
      moderatorId: user._id,
      targetType: 'StreamComment',
      targetId: messageId,
      action: 'delete_chat',
      meta: { streamId, userId: comment.userId?.toString() },
    });

    return reply.send({ ok: true, messageId });
  });

  /* ── Start auction (creator triggers during live) ── */
  app.post('/live/stream/:streamId/start-auction', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    if (!validateId(request.params.streamId, reply)) return;

    const { streamId } = request.params;
    const { productId, startingPrice } = request.body ?? {};
    if (!productId) return reply.status(400).send({ error: 'PRODUCT_ID_REQUIRED' });

    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (stream.status !== 'live') return reply.status(400).send({ error: 'STREAM_NOT_LIVE' });
    if (String(stream.userId) !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN' });

    const product = await db.Product.findOne({
      _id: productId,
      creatorId: stream.userId,
      status: 'active',
    }).lean();
    if (!product) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND' });

    try {
      await commerceIntegrity.assertSellerVerified(user._id);
    } catch (err) {
      if (
        err instanceof commerceIntegrity.SellerNotVerifiedError ||
        err instanceof commerceIntegrity.SellerBlockedError
      ) {
        return reply.status(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }

    const startBidCents = typeof startingPrice === 'number'
      ? (startingPrice >= 100 ? Math.round(startingPrice) : Math.round(startingPrice * 100))
      : product.priceCents || 5000;
    const endsAt = new Date(Date.now() + 30 * 60 * 1000);

    const auction = await db.Auction.create({
      creatorId: stream.userId,
      streamId,
      productId,
      title: product.name,
      imageUrl: product.imageUrls?.[0] || '',
      startBidCents,
      status: 'live',
      startsAt: new Date(),
      endsAt,
    });

    const payload = {
      type: 'auction_started',
      auction: auction.toObject(),
      auctionId: auction._id.toString(),
    };
    broadcastToStream(streamId, payload);
    broadcastToAuction(auction._id.toString(), payload);

    return reply.status(201).send({ ok: true, auction: auction.toObject() });
  });

  /* ── Product drop (creator triggers during live) ── */
  app.post('/live/stream/:streamId/product-drop', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    if (!validateId(request.params.streamId, reply)) return;

    const { streamId } = request.params;
    const { productId, price, quantity } = request.body ?? {};
    if (!productId) return reply.status(400).send({ error: 'PRODUCT_ID_REQUIRED' });

    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (stream.status !== 'live') return reply.status(400).send({ error: 'STREAM_NOT_LIVE' });
    if (String(stream.userId) !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN' });

    const product = await db.Product.findOne({
      _id: productId,
      creatorId: stream.userId,
      status: 'active',
    }).lean();
    if (!product) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND' });

    const priceNum = typeof price === 'number' ? price : product.priceCents / 100;
    const qty = Math.max(1, Math.min(999, Math.round(Number(quantity) || 100)));

    const payload = {
      type: 'product_drop',
      product_id: product._id.toString(),
      productId: product._id.toString(),
      name: product.name,
      price: priceNum,
      priceCents: Math.round(priceNum * 100),
      quantity: qty,
      imageUrl: product.imageUrls?.[0] || null,
    };
    broadcastToStream(streamId, payload);

    return reply.send({ ok: true, product_drop: payload });
  });

  /* ── Report stream ── */
  app.post('/live/stream/:streamId/report', async (request, reply) => {
    const user = await authUser(request);
    if (!requireAuth(user, reply)) return;
    if (!validateId(request.params.streamId, reply)) return;

    const { streamId } = request.params;
    const { reason, description } = request.body || {};
    const validReasons = ['spam', 'harassment', 'nudity', 'violence', 'misinformation', 'hate_speech', 'illegal_content', 'scam', 'copyright_violation', 'other'];
    if (!reason || !validReasons.includes(reason)) {
      return reply.status(400).send({ error: 'INVALID_REASON', valid: validReasons });
    }

    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });

    const existing = await db.Report.findOne({
      reporterId: user._id,
      targetType: 'stream',
      targetId: streamId,
    });
    if (existing) return reply.status(400).send({ error: 'ALREADY_REPORTED' });

    await db.Report.create({
      reporterId: user._id,
      targetType: 'stream',
      targetId: streamId,
      reason,
      description: (description || '').slice(0, 2000),
      status: 'open',
    });

    return reply.status(201).send({ ok: true });
  });
}

async function liveWebSocket(app) {
  const { resolveAuth } = require('../sockets/authSocket');
  const { startBurstInterval } = require('../lib/reactionBurst');
  startBurstInterval((streamId, payload) => {
    liveChat.broadcastToRoom(streamRoomId(streamId), payload);
  });

  app.get('/live/ws', { websocket: true }, async (socket, request) => {
    const url      = new URL(request.url || '', 'http://localhost');
    const streamId = url.searchParams.get('streamId');
    if (!streamId) { socket.close(1008, 'streamId required'); return; }

    const { user, displayName } = await resolveAuth(socket, request);

    const rid = streamRoomId(streamId);
    liveChat.joinRoom(rid, socket);

    // Send current moderation state to joiner (mute chat, disable reactions, block gifts)
    (async () => {
      try {
        const streamModeration = require('../lib/streamModeration');
        const mod = await streamModeration.get(streamId);
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'moderation_state', ...mod }));
        }
      } catch {}
    })();

    socket.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // ── Moderator commands (stream owner, admin/mod, or creator-appointed StreamModerator) ──
      if (msg.type === 'mod_mute_chat' || msg.type === 'mod_disable_reactions' || msg.type === 'mod_block_gifts'
          || msg.type === 'mod_enable_chat' || msg.type === 'mod_enable_reactions' || msg.type === 'mod_enable_gifts') {
        if (!user) return;
        const stream = await db.LiveStream.findById(streamId).lean();
        if (!stream || stream.status !== 'live') return;
        const streamModerator = require('../lib/streamModerator');
        const canMod = isPrivileged(user, stream.userId) || (await streamModerator.isModeratorForStream(streamId, user._id));
        if (!canMod) return;
        const streamModeration = require('../lib/streamModeration');
        const enable = msg.type.startsWith('mod_enable_');
        let flags = {};
        if (msg.type === 'mod_mute_chat' || msg.type === 'mod_enable_chat') flags.chatMuted = !enable;
        if (msg.type === 'mod_disable_reactions' || msg.type === 'mod_enable_reactions') flags.reactionsDisabled = !enable;
        if (msg.type === 'mod_block_gifts' || msg.type === 'mod_enable_gifts') flags.giftsBlocked = !enable;
        const next = await streamModeration.set(streamId, flags);
        live.moderateStream(streamId, user._id.toString(), msg.type, {}).catch(() => {});
        broadcastToStream(streamId, { type: 'moderation_state', ...next });
        return;
      }

      // Legacy: type 'chat' with text
      if (msg.type === 'chat' && msg.text) {
        const streamModeration = require('../lib/streamModeration');
        const mod = await streamModeration.get(streamId);
        if (mod.chatMuted) return;
        await liveChat.handleSendMessage({
          roomId: rid,
          user,
          displayName: msg.displayName || displayName,
          message: msg.text,
          roomType: 'stream',
          entityId: streamId,
        });
        return;
      }
      // New: type 'send_message' with data.message
      if (msg.type === 'send_message' && msg.data?.message) {
        const streamModeration = require('../lib/streamModeration');
        const mod = await streamModeration.get(streamId);
        if (mod.chatMuted) return;
        await liveChat.handleSendMessage({
          roomId: rid,
          user,
          displayName: msg.data.displayName || msg.data.user?.displayName || displayName,
          message: msg.data.message,
          roomType: 'stream',
          entityId: streamId,
        });
        return;
      }

      // TikTok-style live emoji reactions — aggregate in Redis, server sends reaction_burst (not individual).
      // Rate limit: 10/sec (Redis) or 300ms (fallback). Burst interval sends { type: 'reaction_burst', emoji, count }.
      if (msg.type === 'live_reaction' && msg.data?.emoji) {
        const streamModeration = require('../lib/streamModeration');
        const modReactions = await streamModeration.get(streamId);
        if (modReactions.reactionsDisabled) return;
        const emoji = String(msg.data.emoji).trim().slice(0, 8);
        const ALLOWED_EMOJIS = ['🔥', '❤️', '👍', '😂', '😮', '😢', '😡', '🎉', '👏', '💯', '✨', '💪'];
        if (ALLOWED_EMOJIS.includes(emoji) && user) {
          const uid = user._id.toString();
          const { check: checkReactionRateLimit } = require('../lib/reactionRateLimit');
          const { check: checkReactionCooldown, record: recordReactionCooldown } = require('../lib/reactionCooldown');
          const rateLimit = await checkReactionRateLimit(uid);
          const cooldown = checkReactionCooldown(uid);
          if (rateLimit.allowed && cooldown.allowed) {
            recordReactionCooldown(uid);
            const { increment: incrReaction } = require('../lib/reactionCounters');
            const { markActive } = require('../lib/reactionBurst');
            await incrReaction(streamId, emoji).catch(() => {});
            markActive(streamId).catch(() => {});
          }
        }
        return;
      }

      if (msg.type === 'product_drop' && msg.data?.product_id) {
        const stream = await db.LiveStream.findById(streamId).lean();
        if (!stream || stream.status !== 'live') return;
        if (!user || String(stream.userId) !== String(user._id)) return;

        const productId = msg.data.product_id;
        if (!mongoose.Types.ObjectId.isValid(productId)) return;
        const product = await db.Product.findOne({
          _id: productId,
          creatorId: stream.userId,
          status: 'active',
        }).lean();
        if (!product) return;

        const price = typeof msg.data.price === 'number' ? msg.data.price : product.priceCents / 100;
        const quantity = Math.max(1, Math.min(999, Math.round(Number(msg.data.quantity) || 100)));

        const payload = {
          type: 'product_drop',
          product_id: product._id.toString(),
          productId: product._id.toString(),
          name: product.name,
          price,
          priceCents: Math.round(price * 100),
          quantity,
          imageUrl: product.imageUrls?.[0] || null,
        };
        liveChat.broadcastToRoom(rid, payload);
        return;
      }

      if (msg.type === 'start_auction' && msg.data?.product_id) {
        const stream = await db.LiveStream.findById(streamId).lean();
        if (!stream || stream.status !== 'live') return;
        if (!user || String(stream.userId) !== String(user._id)) return;

        const productId = msg.data.product_id;
        if (!mongoose.Types.ObjectId.isValid(productId)) return;
        const product = await db.Product.findOne({
          _id: productId,
          creatorId: stream.userId,
          status: 'active',
        }).lean();
        if (!product) return;

        try {
          await commerceIntegrity.assertSellerVerified(stream.userId);
        } catch (err) {
          if (
            err instanceof commerceIntegrity.SellerNotVerifiedError ||
            err instanceof commerceIntegrity.SellerBlockedError
          ) {
            try {
              if (socket.readyState === 1) {
                socket.send(JSON.stringify({ type: 'auction_error', error: err.code, message: err.message }));
              }
            } catch {}
            return;
          }
          throw err;
        }

        const startingPrice = msg.data.starting_price;
        const startBidCents = typeof startingPrice === 'number'
          ? (startingPrice >= 100 ? Math.round(startingPrice) : Math.round(startingPrice * 100))
          : product.priceCents || 5000;
        const endsAt = new Date(Date.now() + 30 * 60 * 1000);

        const auction = await db.Auction.create({
          creatorId: stream.userId,
          streamId,
          productId,
          title: product.name,
          imageUrl: product.imageUrls?.[0] || '',
          startBidCents,
          status: 'live',
          startsAt: new Date(),
          endsAt,
        });

        const payload = {
          type: 'auction_started',
          auction: auction.toObject(),
          auctionId: auction._id.toString(),
        };
        liveChat.broadcastToRoom(rid, payload);
        broadcastToAuction(auction._id.toString(), payload);
        return;
      }

      // SECURITY: Never trust client gift data. Sender = socket.user (authenticated).
      // Receiver = stream.userId (stream creator). Cost validated via getGiftCost.
      // Uses atomic economy.coins.debit to prevent race-condition double-spend.
      // Anti-replay: reject if timestamp present and older than 10s.
      if (msg.type === 'send_gift' && msg.data?.gift_id && msg.data?.coins != null) {
        if (!user) return;
        const streamModeration = require('../lib/streamModeration');
        const modGifts = await streamModeration.get(streamId);
        if (modGifts.giftsBlocked) return;
        const ts = msg.data?.timestamp != null ? Number(msg.data.timestamp) : null;
        if (ts != null && (Date.now() - ts > 10000 || ts > Date.now() + 5000)) return;
        const nonce = msg.data?.nonce;
        if (nonce) {
          const { checkAndConsumeNonce } = require('../lib/giftNonce');
          const nonceOk = await checkAndConsumeNonce(nonce);
          if (!nonceOk) return; // replay, silently drop
        }
        const stream = await db.LiveStream.findById(streamId).lean();
        if (!stream || stream.status !== 'live') return;
        const receiverId = stream.userId;
        const giftId = String(msg.data.gift_id);
        const coins = Math.max(1, Math.round(Number(msg.data.coins) || 1));

        const actualCost = Math.max(1, Math.round(Number(msg.data.coins) || 1));
        let minCost = 1;
        try {
          const { getGiftCost } = require('@millo/economy');
          if (typeof getGiftCost === 'function') minCost = Math.max(1, getGiftCost(giftId));
        } catch {}
        if (actualCost < minCost) return;

        const LARGE_GIFT_THRESHOLD = Number(process.env.GIFT_LARGE_THRESHOLD_COINS) || 500;
        const isLargeGift = actualCost >= LARGE_GIFT_THRESHOLD;
        const fp = msg.data?.fingerprint;
        if (isLargeGift) {
          if (!fp || String(fp).trim().length < 8) return; // require device fingerprint for large gifts
          const u = await db.User.findById(user._id).select('emailVerified flags').lean();
          if (!u?.emailVerified) return; // require verified email for large gifts
          if (u?.flags?.totpEnabled && !msg.data?.totpCode) return; // require 2FA code when TOTP enabled
        }

        const fraudService = require('../services/fraudService');
        if (String(user._id) === String(receiverId)) return; // self-gift block
        if (await fraudService.hasRecentChargebacks(user._id)) return; // payment reversal: no gifts
        if (await fraudService.hasGiftRingFlag(user._id)) return; // gift ring flagged: block
        const ipCheck = await fraudService.checkIpReputation(request.ip);
        if (!ipCheck.allowed) return;

        if (fp) {
          const sameDevice = await fraudService.checkSameDeviceGift(user._id, receiverId, fp);
          if (!sameDevice.allowed) {
            await fraudService.flagGiftFraud(user._id, sameDevice.reason || 'same_device', { receiverId: String(receiverId), streamId: String(streamId), giftId });
            return;
          }
        }
        const sameIp = await fraudService.checkSameIpGift(user._id, receiverId, request.ip);
        if (!sameIp.allowed) {
          await fraudService.flagGiftFraud(user._id, sameIp.reason || 'same_ip', { receiverId: String(receiverId), streamId: String(streamId), giftId });
          return;
        }

        const { check: checkGiftCooldown, record: recordGiftCooldown } = require('../lib/giftCooldown');
        const cooldown = checkGiftCooldown(user._id);
        if (!cooldown.allowed) return;

        const giftEconomy = require('@millo/economy/src/gifts');
        const splitPreview = await giftEconomy.computeGiftSplit(receiverId, actualCost);
        if (fp) {
          const multi = await fraudService.checkMultiAccount(fp);
          if (!multi.allowed) return;
        }
        const circular = await fraudService.checkCircularGifts(user._id, receiverId);
        if (!circular.allowed) {
          await fraudService.flagGiftFraud(user._id, 'gift_ring', { receiverId: String(receiverId), count: circular.count, streamId: String(streamId), giftId });
          return;
        }
        // Free creator: daily gift cap ($50 default); earnings as pending (no payout until verification/upgrade)
        const giftReceiverEligibility = require('../services/giftReceiverEligibility');
        const receiveAsPending = await giftReceiverEligibility.shouldReceiveAsPending(receiverId);
        if (receiveAsPending) {
          const capCheck = await giftReceiverEligibility.checkFreeCreatorDailyCap(receiverId, splitPreview.creatorCents);
          if (!capCheck.allowed) return; // over daily cap, silently drop or could emit error to sender
        }
        const creatorReputationService = require('../services/creatorReputationService');
        if (!(await creatorReputationService.isLivestreamMonetizationEligible(receiverId))) return; // CRS: no live monetization when score < 30
        const { riskScore } = await fraudService.evaluateGiftRisk(user._id, { fingerprint: fp, ip: request.ip });
        const { shouldBlockTransaction } = require('../services/paymentProtection.service');
        if (shouldBlockTransaction(riskScore)) return;
        const velocity = await fraudService.checkGiftVelocity(user._id, { riskScore });
        if (!velocity.allowed) {
          await db.FraudEvent.create({
            userId: user._id,
            eventType: 'gift',
            action: 'block',
            riskScore,
            signals: ['gift_velocity_exceeded'],
            ip: request.ip,
            deviceFingerprint: fp ? String(fp).slice(0, 256) : null,
            refType: 'gift',
            refId: giftId,
            meta: { count: velocity.count, receiverId: String(receiverId) },
          }).catch(() => {});
          return;
        }
        const valuePerHour = await fraudService.checkGiftValuePerHour(user._id, actualCost);
        if (!valuePerHour.allowed) {
          await db.FraudEvent.create({
            userId: user._id,
            eventType: 'gift',
            action: 'block',
            riskScore,
            signals: ['gift_value_per_hour_exceeded'],
            ip: request.ip,
            deviceFingerprint: fp ? String(fp).slice(0, 256) : null,
            refType: 'gift',
            refId: giftId,
            meta: { totalCents: valuePerHour.totalCents, limitCents: valuePerHour.limitCents, receiverId: String(receiverId) },
          }).catch(() => {});
          return;
        }
        const auditMeta = { giftId, receiverId: String(receiverId), streamId: String(streamId), ip: request.ip };
        if (fp) auditMeta.deviceFingerprint = String(fp).slice(0, 256);
        try {
          const giftResult = await giftEconomy.sendGift(user._id, receiverId, actualCost, giftId, {
            ...auditMeta,
            giftId,
            pendingEarnings: receiveAsPending,
          });
          // Verified (non-trusted) creators: 7-day hold on gift earnings to stop chargeback fraud
          const applyGiftHold = await giftReceiverEligibility.shouldApplyGiftHold(receiverId);
          const creatorSettled = giftResult.giftSplit?.creatorCents ?? 0;
          if (applyGiftHold && creatorSettled > 0) {
            const holdDaysMs = giftReceiverEligibility.getGiftHoldDays() * 24 * 60 * 60 * 1000;
            fraudService.applyPayoutHold(receiverId, creatorSettled, {
              holdDaysMs,
              reason: 'gift_chargeback_protection',
              meta: { giftId, streamId: String(streamId) },
            }).catch(() => {});
          }
          await db.LiveStream.findByIdAndUpdate(streamId, { $inc: { totalGiftCoins: actualCost } }).catch(() => {});
          const { increment: incrGiftLeaderboard } = require('../lib/giftLeaderboard');
          incrGiftLeaderboard(streamId, user._id, actualCost).catch(() => {});
          fraudService.logGiftSent(user._id, actualCost, {
            refType: 'gift',
            refId: giftId,
            ip: request.ip,
            meta: fp ? { deviceFingerprint: String(fp).slice(0, 256) } : {},
          }).catch(() => {});
          const { getFraudCheckQueue } = require('../lib/fraudQueue');
          getFraudCheckQueue().add('gift', {
            sender_id: String(user._id),
            receiver_id: String(receiverId),
            amountCents: actualCost,
            giftId,
          }).catch(() => {});
          recordGiftCooldown(user._id);
        } catch (err) {
          if (err?.message === 'INSUFFICIENT_BALANCE') return;
          throw err;
        }

        const payload = {
          type: 'gift_sent',
          gift_id: giftId,
          giftId,
          coins: actualCost,
          senderId: user._id.toString(),
          displayName: displayName || 'Viewer',
        };
        const moderationService = require('../services/moderationService');
        const senderShadowBanned = await moderationService.isShadowBanned(user._id);
        if (!senderShadowBanned) liveChat.broadcastToRoom(rid, payload);
        if (!senderShadowBanned) {
          const { publishGiftSentKafka } = require('../lib/giftKafkaPublish');
          publishGiftSentKafka({
            senderId: user._id,
            receiverId,
            giftId,
            coins: actualCost,
            streamId,
            ip: request.ip,
            deviceFingerprint: fp ? String(fp).slice(0, 256) : null,
            source: 'live_ws',
            fraudQueueEnqueued: true,
          }).catch(() => {});
        }
      }
    });

    socket.on('close', () => {
      liveChat.leaveRoom(rid, socket);
    });
  });

  /* ── Event room WebSocket (join_event, event_chat → event_message) ── */
  app.get('/live/event/ws', { websocket: true }, async (socket, request) => {
    const url = new URL(request.url || '', 'http://localhost');
    const eventId = url.searchParams.get('eventId');
    if (!eventId) { socket.close(1008, 'eventId required'); return; }
    if (!mongoose.Types.ObjectId.isValid(eventId)) { socket.close(1008, 'invalid eventId'); return; }

    const event = await db.LiveEvent.findById(eventId).lean();
    if (!event) { socket.close(1008, 'event not found'); return; }
    if (!['scheduled', 'live'].includes(event.status)) {
      socket.close(1008, 'event not available for chat');
      return;
    }

    const { user, displayName } = await resolveAuth(socket, request);

    let currentRid = liveChat.roomId('event', eventId);
    let currentEventId = eventId;
    liveChat.joinRoom(currentRid, socket);

    socket.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'join_event' && msg.data?.eventId) {
        const newEid = String(msg.data.eventId);
        if (mongoose.Types.ObjectId.isValid(newEid)) {
          liveChat.leaveRoom(currentRid, socket);
          currentRid = liveChat.roomId('event', newEid);
          currentEventId = newEid;
          liveChat.joinRoom(currentRid, socket);
        }
        return;
      }

      if (msg.type === 'event_chat' && msg.data?.message) {
        await liveChat.handleSendMessage({
          roomId: currentRid,
          user,
          displayName: msg.data.displayName || displayName,
          message: msg.data.message,
          roomType: 'event',
          entityId: currentEventId,
        });
      }
      if (msg.type === 'send_message' && msg.data?.message) {
        await liveChat.handleSendMessage({
          roomId: currentRid,
          user,
          displayName: msg.data.displayName || displayName,
          message: msg.data.message,
          roomType: 'event',
          entityId: currentEventId,
        });
      }
    });

    socket.on('close', () => {
      liveChat.leaveRoom(currentRid, socket);
    });
  });
}

/** Ingest webhooks — called by nginx-rtmp on_publish / on_done */
async function ingestRoutes(app) {
  const db             = require('@millo/database');
  const { broadcastStream } = require('./userWs');

  app.post('/live/ingest/on_publish', async (request, reply) => {
    const streamKey = request.body?.name || request.body?.streamKey;
    if (!streamKey) return reply.status(400).send('bad request');
    const stream = await db.LiveStream.findOne({ streamKey }).lean();
    if (!stream) return reply.status(403).send('unknown key');
    // Optionally verify stream is expected to be live
    return reply.status(200).send('ok');
  });

  app.post('/live/ingest/on_done', async (request, reply) => {
    const streamKey = request.body?.name || request.body?.streamKey;
    if (!streamKey) return reply.status(400).send('bad request');
    const stream = await db.LiveStream.findOne({ streamKey });
    if (!stream) return reply.status(200).send('ok'); // already handled

    const hlsHost = process.env.HLS_HOST || 'hls.milloapp.com';
    const recHost = process.env.RECORDING_HOST || hlsHost;

    if (stream.status === 'live') {
      stream.status  = 'ended';
      stream.endedAt = stream.endedAt || new Date();
      if (stream.startedAt) {
        stream.recordingDuration = Math.round((Date.now() - new Date(stream.startedAt).getTime()) / 1000);
      }
      // Recording will be at /recordings/<streamKey>-<timestamp>.mp4 (packaged by FFmpeg worker)
      // Approximate URL — actual URL sent by FFmpeg worker via POST /content/streams/:id/recording
      stream.recordingUrl = stream.recordingUrl || null;
      await stream.save();
    }

    broadcastStream(String(stream._id), { type: 'stream_ended', data: { streamId: String(stream._id) } });
    return reply.status(200).send('ok');
  });
}

function auctionRoomId(auctionId) {
  return liveChat.roomId('auction', auctionId);
}

function broadcastToAuction(auctionId, payload) {
  liveChat.broadcastToRoom(auctionRoomId(auctionId), payload);
}

async function auctionWebSocket(app) {
  const { resolveAuth } = require('../sockets/authSocket');

  app.get('/ws/auction/:id', { websocket: true }, async (socket, request) => {
    const auctionId = request.params?.id;
    if (!auctionId) { socket.close(1008, 'auctionId required'); return; }

    const { user, displayName } = await resolveAuth(socket, request);

    const rid = auctionRoomId(auctionId);
    liveChat.joinRoom(rid, socket);

    socket.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'send_message' && msg.data?.message) {
        await liveChat.handleSendMessage({
          roomId: rid,
          user,
          displayName: msg.data.displayName || msg.data.user?.displayName || displayName,
          message: msg.data.message,
          roomType: 'auction',
          entityId: auctionId,
        });
      }
      if (msg.type === 'chat' && msg.text) {
        await liveChat.handleSendMessage({
          roomId: rid,
          user,
          displayName: msg.displayName || displayName,
          message: msg.text,
          roomType: 'auction',
          entityId: auctionId,
        });
        return;
      }

      if (msg.type === 'bid' && (msg.data?.amount != null || msg.data?.amountCents != null)) {
        const sendBidError = (err) => {
          try {
            if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'bid_error', error: err }));
          } catch {}
        };
        if (!user) { sendBidError('UNAUTHORIZED'); return; }
        let amountCents = msg.data?.amountCents;
        if (amountCents == null) {
          const amt = Number(msg.data?.amount);
          amountCents = amt >= 100 ? Math.round(amt) : Math.round(amt * 100);
        }
        if (!Number.isInteger(amountCents) || amountCents < 1) { sendBidError('INVALID_AMOUNT'); return; }

        try {
          const auction = await db.Auction.findById(auctionId);
          if (!auction || auction.status !== 'live') { sendBidError('AUCTION_NOT_LIVE'); return; }
          if (new Date(auction.endsAt) <= new Date()) { sendBidError('AUCTION_ENDED'); return; }

          const fraudService = require('../services/fraudService');
          if (await fraudService.hasAuctionBidFraudFlag(user._id)) {
            sendBidError('AUCTION_BID_FRAUD');
            return;
          }
          const bidderFingerprint = msg.data?.deviceFingerprint;
          if (bidderFingerprint) {
            const sameDevice = await fraudService.checkSameDeviceAuctionBid(user._id, auction.creatorId, bidderFingerprint);
            if (!sameDevice.allowed) {
              await fraudService.flagAuctionBidFraud(user._id, auctionId, sameDevice.reason, { auctionId: String(auction._id), creatorId: String(auction.creatorId) });
              sendBidError('AUCTION_BID_FRAUD');
              return;
            }
          }
          const bidCluster = await fraudService.checkAuctionBidCluster(auctionId, user._id);
          if (!bidCluster.allowed) {
            await fraudService.flagAuctionBidFraud(user._id, auctionId, bidCluster.reason, { auctionId: String(auction._id), bidCount: bidCluster.bidCount });
            sendBidError('AUCTION_BID_FRAUD');
            return;
          }
          const lastSecond = await fraudService.checkLastSecondBidPattern(auctionId, user._id, auction.endsAt);
          if (!lastSecond.allowed) {
            await fraudService.flagAuctionBidFraud(user._id, auctionId, lastSecond.reason, { auctionId: String(auction._id), count: lastSecond.count });
            sendBidError('AUCTION_BID_FRAUD');
            return;
          }

          const minBidPre = (auction.currentBidCents ?? auction.startBidCents - 1) + 1;
          if (amountCents < minBidPre) { sendBidError('BID_TOO_LOW'); return; }

          const { appendEntry } = require('@millo/economy');

          await withAuctionLock(auctionId, async () => {
            const a0 = await db.Auction.findById(auctionId);
            if (!a0 || a0.status !== 'live') { sendBidError('AUCTION_NOT_LIVE'); return; }
            if (new Date(a0.endsAt) <= new Date()) { sendBidError('AUCTION_ENDED'); return; }

            const walletIds = [String(user._id)];
            if (a0.currentBidderId && String(a0.currentBidderId) !== String(user._id)) {
              walletIds.push(String(a0.currentBidderId));
            }

            await withOrderedWalletLocks(walletIds, async () => {
              const auctionLocked = await db.Auction.findById(auctionId);
              if (!auctionLocked || auctionLocked.status !== 'live') { sendBidError('AUCTION_NOT_LIVE'); return; }
              if (new Date(auctionLocked.endsAt) <= new Date()) { sendBidError('AUCTION_ENDED'); return; }

              const minBid = (auctionLocked.currentBidCents ?? auctionLocked.startBidCents - 1) + 1;
              if (amountCents < minBid) { sendBidError('BID_TOO_LOW'); return; }

              const bidderWallet = await db.Wallet.findOne({ userId: user._id });
              if (!bidderWallet || bidderWallet.balanceCents < amountCents) { sendBidError('INSUFFICIENT_COINS'); return; }

              const prevBidderId = auctionLocked.currentBidderId;
              const prevBidCents = auctionLocked.currentBidCents ?? 0;
              if (prevBidderId && prevBidderId.toString() !== user._id.toString() && prevBidCents > 0) {
                await db.Wallet.findOneAndUpdate(
                  { userId: prevBidderId },
                  { $inc: { balanceCents: prevBidCents } }
                );
                await appendEntry({
                  type: 'refund',
                  actorId: prevBidderId,
                  amountCents: prevBidCents,
                  refType: 'auction_refund',
                  refId: String(auctionLocked._id),
                  meta: { auctionId: String(auctionLocked._id), reason: 'outbid' },
                }).catch(() => {});
              }

              await db.Wallet.findOneAndUpdate(
                { userId: user._id },
                { $inc: { balanceCents: -amountCents } }
              );
              await appendEntry({
                type: 'bid_hold',
                actorId: user._id,
                amountCents: -amountCents,
                refType: 'auction_bid',
                refId: String(auctionLocked._id),
                meta: { auctionId: String(auctionLocked._id) },
              }).catch(() => {});

              auctionLocked.bids.push({
                bidderId: user._id,
                amountCents,
                displayName: displayName || 'Bidder',
              });
              auctionLocked.currentBidCents = amountCents;
              auctionLocked.currentBidderId = user._id;
              await auctionLocked.save();

              const bidPayload = {
                type: 'new_bid',
                auction: auctionLocked.toObject(),
                bidderId: user._id.toString(),
                displayName: displayName || 'Bidder',
                amountCents,
              };
              broadcastToAuction(auctionId, bidPayload);
              if (auctionLocked.streamId) {
                broadcastToStream(String(auctionLocked.streamId), bidPayload);
              }
            });
          });
        } catch (err) {
          if (err instanceof LockContentionError) {
            sendBidError('LOCK_BUSY');
            return;
          }
          request.log.warn({ err, auctionId }, 'Auction WS: bid failed');
          try {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ type: 'bid_error', error: err.message || 'BID_FAILED' }));
            }
          } catch {}
        }
      }
    });

    socket.on('close', () => {
      liveChat.leaveRoom(rid, socket);
    });
  });
}

/** Paid meetings — chat room per DMSession. Connect: /ws/meeting/:sessionId?token= */
async function meetingWebSocket(app) {
  const { resolveAuth } = require('../sockets/authSocket');

  app.get('/ws/meeting/:sessionId', { websocket: true }, async (socket, request) => {
    const sessionId = request.params?.sessionId;
    if (!sessionId) { socket.close(1008, 'sessionId required'); return; }

    const { user, displayName } = await resolveAuth(socket, request);

    const rid = liveChat.roomId('meeting', sessionId);
    liveChat.joinRoom(rid, socket);

    socket.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'send_message' && msg.data?.message) {
        await liveChat.handleSendMessage({
          roomId: rid,
          user,
          displayName: msg.data.displayName || msg.data.user?.displayName || displayName,
          message: msg.data.message,
          roomType: 'meeting',
          entityId: sessionId,
        });
      }
      if (msg.type === 'chat' && msg.text) {
        await liveChat.handleSendMessage({
          roomId: rid,
          user,
          displayName: msg.displayName || displayName,
          message: msg.text,
          roomType: 'meeting',
          entityId: sessionId,
        });
      }
    });

    socket.on('close', () => {
      liveChat.leaveRoom(rid, socket);
    });
  });
}

module.exports = { liveRoutes, liveWebSocket, ingestRoutes, auctionWebSocket, meetingWebSocket, broadcastToAuction, broadcastToStream, getBroadcastToStream, getFiltersEnabled };
