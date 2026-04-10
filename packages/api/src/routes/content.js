'use strict';
/**
 * Content routes — live streams feed, creator profiles, user feed, search.
 *
 * GET  /content/streams             → live + scheduled streams
 * GET  /content/feed                → personalised content feed
 * GET  /content/search?q=           → search users, streams, content (empty q → trending discovery)
 * GET  /content/search/advanced     → same behavior; empty q → trending fallback (explicit advanced surface)
 * GET  /content/creators/discover   → creator directory (sort, category, live)
 * GET  /content/creators/:id        → creator public profile
 * PUT  /content/profile             → update own profile (auth required)
 * GET  /content/notifications       → user notifications (auth required)
 * POST /content/notifications/read  → mark notifications read (auth required)
 * GET  /content/analytics/me        → creator analytics for current user
 * https://milloapp.com
 */
const mongoose       = require('mongoose');
const db             = require('@millo/database');
const { appendEntry, pricing } = require('@millo/economy');
const { rankLive, discoveryService } = require('@millo/discovery');
const trendingSoundsRedis = require('../lib/trendingSoundsRedis');
const compliance = require('@millo/compliance');
const { resolveSession } = require('./auth');
const { requireVerifiedUser } = require('../middleware/auth.middleware');
const { validateId } = require('../lib/validateId');
const { withOrderedWalletLocks, LockContentionError } = require('../lib/walletLock');
const { getVideo } = require('../controllers/video.controller');
const moderationService = require('../services/moderationService');
const captchaService = require('../services/captchaService');
const { trackEvent } = require('../server/services/analytics');
const kafkaEventBus = require('../services/kafkaEventBus');

// Per-route rate-limit configs (protect API endpoints)
const GIFT_RATE_LIMIT = {
  max: 30,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many gifts — please slow down' }),
};
const STREAM_START_RATE_LIMIT = {
  max: 5,
  timeWindow: '1 hour',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many stream starts in one hour' }),
};
const LIKES_RATE_LIMIT = {
  max: 60,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many likes — please slow down' }),
};
const COMMENTS_RATE_LIMIT = {
  max: 30,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many comments — please slow down' }),
};

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  return resolveSession(token);
}

/** Attach sound attribution (🎵 Sound: Title) to streams. streamList: array of objects with _id. */
async function attachVideoSounds(streamList) {
  if (!streamList?.length) return {};
  const videoIds = streamList.map((s) => s._id);
  const videoSounds = await db.VideoSound.find({ videoId: { $in: videoIds } }).lean();
  if (!videoSounds.length) return {};
  const soundIds = [...new Set(videoSounds.map((vs) => vs.soundId))];
  const tracks = await db.MusicTrack.find({ _id: { $in: soundIds } }).select('_id title artist').lean();
  const trackMap = Object.fromEntries(tracks.map((t) => [String(t._id), t]));
  const out = {};
  for (const vs of videoSounds) {
    const track = trackMap[String(vs.soundId)];
    const title = track ? (track.title || 'Unknown') : 'Unknown';
    out[String(vs.videoId)] = {
      videoId: vs.videoId,
      soundId: vs.soundId,
      creatorId: vs.creatorId,
      startTime: vs.startTime,
      duration: vs.duration,
      title,
      artist: track?.artist || null,
      soundDisplay: `🎵 Sound: ${title}`,
    };
  }
  return out;
}

/** Build Set of stream IDs the user has unlocked (for PPV gating). */
async function getUnlockedStreamIds(userId, streamIds) {
  if (!userId || !streamIds?.length) return new Set();
  const paidIds = streamIds; // caller passes only paid stream IDs if desired, or all
  const purchases = await db.PpvPurchase.find({ userId, streamId: { $in: paidIds } })
    .select('streamId').lean();
  return new Set(purchases.map((p) => String(p.streamId)));
}

/**
 * Empty-query discovery for /content/search — trending hashtags, top creators by followers,
 * live-heavy streams, recent products. https://milloapp.com
 */
async function buildTrendingDiscoverySearchResults(request, { type, category, limit, offset }) {
  const lim = Math.min(Number(limit) || 20, 50);
  const off = Number(offset) || 0;
  const user = await authUser(request).catch(() => null);

  const wantUsers = type === 'all' || type === 'users';
  const wantStreams = type === 'all' || type === 'streams';
  const wantProducts = type === 'all' || type === 'products';

  const hashtagDocs = await db.HashtagTrend.find({})
    .sort({ usageCount: -1, updatedAt: -1 })
    .limit(20)
    .select('hashtag usageCount')
    .lean()
    .catch(() => []);

  const trendingHashtags = (hashtagDocs || []).map((h) => ({
    tag: h.hashtag,
    count: h.usageCount ?? 0,
  }));

  let userResults = [];
  if (wantUsers) {
    const topFollowed = await db.Follow.aggregate([
      { $group: { _id: '$followingId', followerCount: { $sum: 1 } } },
      { $sort: { followerCount: -1 } },
      { $skip: off },
      { $limit: lim },
    ]);
    const ids = topFollowed.map((x) => x._id).filter(Boolean);
    const countMap = Object.fromEntries(topFollowed.map((x) => [String(x._id), x.followerCount]));
    const profiles = ids.length
      ? await db.Profile.find({ userId: { $in: ids }, shadowBanned: { $ne: true } }).lean()
      : [];
    const profByUser = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    userResults = ids
      .map((uid) => {
        const p = profByUser[String(uid)];
        if (!p) return null;
        return {
          _id: p.userId,
          displayName: p.displayName || 'Creator',
          handle: p.meta?.username || '',
          avatarUrl: p.avatarUrl || null,
          bio: p.bio || '',
          followerCount: countMap[String(uid)] || 0,
        };
      })
      .filter(Boolean);
  }

  let streamResults = [];
  if (wantStreams) {
    const streamQuery = {
      status: { $in: ['live', 'scheduled'] },
      removedAt: null,
      ...(category ? { category } : {}),
    };
    const streams = await db.LiveStream.find(streamQuery)
      .sort({ viewerCount: -1, startedAt: -1 })
      .skip(off)
      .limit(lim)
      .lean();
    const streamUserIds = [...new Set(streams.map((s) => String(s.userId)))];
    const creatorProfiles = streamUserIds.length
      ? await db.Profile.find({ userId: { $in: streamUserIds } }).lean()
      : [];
    const profMap = Object.fromEntries(creatorProfiles.map((p) => [String(p.userId), p]));
    const paidStreamIds = streams.filter((s) => s.visibility === 'paid' && (s.priceCents || 0) > 0).map((s) => s._id);
    const unlockedSet = await getUnlockedStreamIds(user?._id, paidStreamIds);
    streamResults = streams.map((s) => {
      const ppv = applyPpvGating(s, user?._id, unlockedSet);
      return {
        ...s,
        creatorName: profMap[String(s.userId)]?.displayName || 'Creator',
        creatorAvatar: profMap[String(s.userId)]?.avatarUrl || null,
        thumbnailUrl: s.thumbnailUrl || s.meta?.thumbnailUrl || null,
        viewerCount: s.viewerCount ?? s.meta?.viewerCount ?? 0,
        streamUrl: s.status === 'live' ? ppv.streamUrl : null,
      };
    });
  }

  let productResults = [];
  if (wantProducts) {
    const products = await db.Product.find({
      status: 'active',
      ...(category ? { category } : {}),
    })
      .sort({ createdAt: -1 })
      .skip(off)
      .limit(lim)
      .lean();
    const productCreatorIds = [...new Set(products.map((p) => String(p.creatorId)))];
    const creatorProfiles = productCreatorIds.length
      ? await db.Profile.find({ userId: { $in: productCreatorIds } }).lean()
      : [];
    const profMap = Object.fromEntries(creatorProfiles.map((p) => [String(p.userId), p]));
    productResults = products.map((p) => ({
      ...p,
      creatorProfile: profMap[String(p.creatorId)] || null,
    }));
  }

  const total = userResults.length + streamResults.length + productResults.length;
  return {
    ok: true,
    users: userResults,
    streams: streamResults,
    products: productResults,
    total,
    trendingHashtags,
    discovery: true,
    q: '',
  };
}

/**
 * Shared search: empty q → trending discovery; otherwise regex search across profiles, streams, products.
 * @param {import('fastify').FastifyRequest} request
 */
async function runContentSearchQuery(request) {
  const q = (request.query.q || '').trim();
  const type = request.query.type || 'all';
  const category = request.query.category;
  const limit = Math.min(Number(request.query.limit) || 20, 50);
  const offset = Number(request.query.offset) || 0;

  if (!q) {
    return buildTrendingDiscoverySearchResults(request, { type, category, limit, offset });
  }

  const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  const wantUsers = type === 'all' || type === 'users';
  const wantStreams = type === 'all' || type === 'streams';
  const wantProducts = type === 'all' || type === 'products';

  const [profiles, streams, products] = await Promise.all([
    wantUsers
      ? db.Profile.find({ $or: [{ displayName: regex }, { bio: regex }, { 'meta.username': regex }] })
          .skip(offset)
          .limit(limit)
          .lean()
      : [],
    wantStreams
      ? db.LiveStream.find({
          title: regex,
          status: { $in: ['live', 'scheduled'] },
          ...(category ? { category } : {}),
        })
          .skip(offset)
          .limit(limit)
          .lean()
      : [],
    wantProducts
      ? db.Product.find({
          $or: [{ name: regex }, { description: regex }],
          status: 'active',
          ...(category ? { category } : {}),
        })
          .skip(offset)
          .limit(limit)
          .lean()
      : [],
  ]);

  const streamUserIds = [...new Set(streams.map((s) => String(s.userId)))];
  const productCreatorIds = [...new Set(products.map((p) => String(p.creatorId)))];
  const allUserIds = [...new Set([...streamUserIds, ...productCreatorIds])];
  const creatorProfiles = allUserIds.length
    ? await db.Profile.find({ userId: { $in: allUserIds } }).lean()
    : [];
  const profMap = Object.fromEntries(creatorProfiles.map((p) => [String(p.userId), p]));

  const userResults = profiles.map((p) => ({
    _id: p.userId,
    displayName: p.displayName || 'Creator',
    handle: p.meta?.username || '',
    avatarUrl: p.avatarUrl || null,
    bio: p.bio || '',
    followerCount: p.followerCount || 0,
  }));

  const streamResults = streams.map((s) => ({
    ...s,
    creatorName: profMap[String(s.userId)]?.displayName || 'Creator',
    creatorAvatar: profMap[String(s.userId)]?.avatarUrl || null,
  }));

  const productResults = products.map((p) => ({
    ...p,
    creatorProfile: profMap[String(p.creatorId)] || null,
  }));

  const total = userResults.length + streamResults.length + productResults.length;
  return { ok: true, users: userResults, streams: streamResults, products: productResults, total, q };
}

/** Viral Sound Engine: push videos that use high-scoring sounds. Re-sorts items by engagement + sound viral score. */
const VIRAL_SOUND_BOOST_WEIGHT = Number(process.env.VIRAL_SOUND_BOOST_WEIGHT) || 0.15;

/** Sound saturation: max share of feed any single sound can take (0–1). Prevents feed monotony; default 8%. */
const MAX_FEED_SHARE_PER_SOUND = Math.min(1, Math.max(0.01, Number(process.env.MAX_FEED_SHARE_PER_SOUND) || 0.08));

async function applyViralSoundBoost(items, feedType) {
  if (!items?.length || !['shorts', 'trending', 'global'].includes(feedType)) return items;
  const streamIds = items.map((i) => i.id || i.stream?._id).filter(Boolean);
  if (!streamIds.length) return items;
  const videoSounds = await db.VideoSound.find({ videoId: { $in: streamIds } }).select('videoId soundId').lean();
  if (!videoSounds.length) return items;
  const videoToSound = Object.fromEntries(videoSounds.map((vs) => [String(vs.videoId), String(vs.soundId)]));
  const soundIds = [...new Set(Object.values(videoToSound))];
  const scoreMap = await trendingSoundsRedis.getSoundViralScoresMap(soundIds).catch(() => ({}));
  const getScore = (item) => {
    const id = item.id || item.stream?._id;
    const soundId = id ? videoToSound[String(id)] : null;
    return soundId ? (scoreMap[soundId] || 0) : 0;
  };
  return [...items].sort((a, b) => {
    const scoreA = (a._score ?? a.engagementScore ?? a.baseScore ?? 0) + getScore(a) * VIRAL_SOUND_BOOST_WEIGHT;
    const scoreB = (b._score ?? b.engagementScore ?? b.baseScore ?? 0) + getScore(b) * VIRAL_SOUND_BOOST_WEIGHT;
    return scoreB - scoreA;
  });
}

/** Cap how many feed slots one sound can occupy (prevents feed monotony). Applied after viral boost for shorts/trending/global. */
async function applySoundSaturationCap(items, feedLimit) {
  if (!items?.length || feedLimit <= 0) return items;
  const maxPerSound = Math.max(1, Math.floor(feedLimit * MAX_FEED_SHARE_PER_SOUND));
  const streamIds = items.map((i) => i.id || i.stream?._id).filter(Boolean);
  if (!streamIds.length) return items.slice(0, feedLimit);
  const videoSounds = await db.VideoSound.find({ videoId: { $in: streamIds } }).select('videoId soundId').lean();
  const videoToSound = Object.fromEntries(videoSounds.map((vs) => [String(vs.videoId), String(vs.soundId)]));
  const result = [];
  const countBySound = {};
  for (const item of items) {
    if (result.length >= feedLimit) break;
    const id = item.id || item.stream?._id;
    const soundId = id ? (videoToSound[String(id)] ?? '__none__') : '__none__';
    const count = countBySound[soundId] ?? 0;
    if (count < maxPerSound) {
      result.push(item);
      countBySound[soundId] = count + 1;
    }
  }
  return result;
}

/** Resolve stream playback URL and PPV metadata — gate paid streams unless unlocked. */
function applyPpvGating(stream, userId, unlockedSet) {
  const playbackUrl = stream.playbackUrl ?? stream.meta?.playbackUrl ?? null;
  const isPaid = stream.visibility === 'paid' && (stream.priceCents || 0) > 0;
  const isCreator = userId && stream.userId?.toString() === userId.toString();
  const hasUnlocked = unlockedSet?.has(String(stream._id));
  const canPlay = !isPaid || isCreator || hasUnlocked;
  return {
    streamUrl:  stream.status === 'live' ? (canPlay ? playbackUrl : null) : null,
    priceCents: isPaid ? (stream.priceCents || 0) : null,
    isLocked:   isPaid && !canPlay,
  };
}

async function contentRoutes(app) {

  /* ── Live streams ── */
  app.get('/content/streams', async (request, reply) => {
    const { filter = 'all', limit = 20, offset = 0 } = request.query ?? {};
    const user = await authUser(request).catch(() => null);
    const region = request.region || {};
    const regionCode = region.user_compliance_zone || region.user_country || 'US';
    const access = user ? await compliance.canAccessContent(user._id, 'explicit', regionCode) : { allowed: false };
    const contentFilter = compliance.contentFilterForUser(access.allowed);
    const query = {};
    if (filter === 'live')      query.status = 'live';
    else if (filter === 'scheduled') query.status = 'scheduled';
    else if (filter === 'ppv')  { query.status = 'live'; query.visibility = 'paid'; }
    else if (filter === 'public') { query.status = 'live'; query.visibility = 'public'; }
    else query.status = { $in: ['live', 'scheduled'] };
    query.removedAt = null; // Exclude DMCA/policy-removed content
    Object.assign(query, contentFilter);

    const [streams, totalFiltered] = await Promise.all([
      db.LiveStream.find(query)
      .sort({ startedAt: -1, createdAt: -1 })
      .skip(Number(offset))
      .limit(Math.min(Number(limit), 50))
        .lean(),
      db.LiveStream.countDocuments(query),
    ]);

    const paidStreamIds = streams.filter((s) => s.visibility === 'paid').map((s) => s._id);
    const unlockedSet = await getUnlockedStreamIds(user?._id, paidStreamIds);

    // Enrich with creator profile
    const userIds = [...new Set(streams.map((s) => String(s.userId)))];
    const profiles = await db.Profile.find({ userId: { $in: userIds } }).lean();
    const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));

    const viewers = await db.LiveViewer.aggregate([
      { $match: { streamId: { $in: streams.map((s) => s._id) }, active: true } },
      { $group: { _id: '$streamId', count: { $sum: 1 } } },
    ]).catch(() => []);
    const viewerMap = Object.fromEntries(viewers.map((v) => [String(v._id), v.count]));

    const enriched = streams.map((s) => {
      const prof = profileMap[String(s.userId)] || {};
      const ppv = applyPpvGating(s, user?._id, unlockedSet);
      return {
        id:          s._id,
        title:       s.title || 'Live Stream',
        creator:     prof.displayName || 'Creator',
        creatorId:   s.userId,
        avatarUrl:   prof.avatarUrl,
        status:      s.status,
        visibility:  s.visibility,
        viewers:     viewerMap[String(s._id)] ?? s.meta?.viewerCount ?? 0,
        startedAt:   s.startedAt,
        price:       ppv.priceCents ?? s.meta?.ppvPrice ?? null,
        priceCents:  ppv.priceCents,
        isLocked:    ppv.isLocked,
        thumbnailUrl: s.thumbnailUrl ?? s.meta?.thumbnailUrl ?? null,
        streamUrl:   s.status === 'live' ? ppv.streamUrl : null,
      };
    });

    const counts = { all: 0, live: 0, ppv: 0, public: 0 };
    const allActive = await db.LiveStream.find({ status: { $in: ['live', 'scheduled'] } }).lean();
    allActive.forEach((s) => {
      counts.all++;
      if (s.status === 'live') counts.live++;
      if (s.visibility === 'paid') counts.ppv++;
      if (s.visibility === 'public' && s.status === 'live') counts.public++;
    });

    const includeEvents = filter === 'all' || filter === 'scheduled';
    let upcomingEvents = [];
    if (includeEvents) {
      const eventQuery = { status: 'scheduled', scheduledStart: { $gte: new Date() } };
      upcomingEvents = await db.LiveEvent.find(eventQuery)
        .sort({ scheduledStart: 1 })
        .limit(20)
        .populate('creatorId', 'displayName avatarUrl')
        .lean();
      const eventCreatorIds = [...new Set(upcomingEvents.map((e) => String(e.creatorId?._id || e.creatorId)))];
      const eventProfiles = await db.Profile.find({ userId: { $in: eventCreatorIds } }).lean();
      const eventProfMap = Object.fromEntries(eventProfiles.map((p) => [String(p.userId), p]));
      const [attendanceCounts, ticketCounts, chatCounts] = await Promise.all([
        db.EventAttendance.aggregate([
          { $match: { eventId: { $in: upcomingEvents.map((e) => e._id) } } },
          { $group: { _id: '$eventId', count: { $sum: 1 } } },
        ]).catch(() => []),
        db.EventAttendance.aggregate([
          { $match: { eventId: { $in: upcomingEvents.map((e) => e._id) }, ticketPaid: true } },
          { $group: { _id: '$eventId', count: { $sum: 1 } } },
        ]).catch(() => []),
        db.EventComment.aggregate([
          { $match: { eventId: { $in: upcomingEvents.map((e) => e._id) } } },
          { $group: { _id: '$eventId', count: { $sum: 1 } } },
        ]).catch(() => []),
      ]);
      const attMap = Object.fromEntries(attendanceCounts.map((a) => [String(a._id), a.count]));
      const ticketMap = Object.fromEntries(ticketCounts.map((t) => [String(t._id), t.count]));
      const chatMap = Object.fromEntries(chatCounts.map((c) => [String(c._id), c.count]));
      upcomingEvents = upcomingEvents.map((e) => {
        const cid = String(e.creatorId?._id || e.creatorId);
        const prof = eventProfMap[cid] || e.creatorId || {};
        return {
          id: e._id,
          type: 'event',
          title: e.title || 'Live Event',
          creator: prof.displayName || e.creatorId?.displayName || 'Creator',
          creatorId: cid,
          avatarUrl: prof.avatarUrl || e.creatorId?.avatarUrl,
          status: 'scheduled',
          viewers: attMap[String(e._id)] ?? 0,
          scheduledStart: e.scheduledStart,
          thumbnailUrl: e.thumbnailUrl,
          ticketPriceCents: e.ticketPriceCents ?? 0,
          eventType: e.eventType,
          attendanceCount: attMap[String(e._id)] ?? 0,
          ticketSalesCount: ticketMap[String(e._id)] ?? 0,
          chatCount: chatMap[String(e._id)] ?? 0,
        };
      });
    }

    return reply.send({ ok: true, streams: enriched, upcomingEvents, counts, total: totalFiltered });
  });

  /* ── Phase 7: Discovery feed by type (global, regional, following, trending, shopping) ── */
  app.get('/content/feed/:feedType', async (request, reply) => {
    const { feedType } = request.params;
    const { limit = 20, offset = 0 } = request.query ?? {};
    const lim = Math.min(Number(limit) || 20, 50);
    const user = await authUser(request).catch(() => null);
    const region = request.region || {};
    const regionCode = region.user_compliance_zone || region.user_country || 'US';
    const access = user ? await compliance.canAccessContent(user._id, 'explicit', regionCode) : { allowed: false };
    const contentFilter = compliance.contentFilterForUser(access.allowed);
    try {
      const needsSaturation = ['shorts', 'trending', 'global'].includes(feedType);
      const requestLimit = needsSaturation ? Math.min(lim * 3, 150) : lim;
      let items = await discoveryService.getFeed(feedType, {
        userId: user?._id,
        limit: requestLimit,
        offset,
        region,
        contentFilter,
      });
      const ghostBanService = require('../services/ghostBanService');
      const feedCreatorIds = [...new Set(items.map((i) => i.creatorId || i.stream?.userId).filter(Boolean))];
      const feedMultiplierMap = {};
      await Promise.all(
        feedCreatorIds.map(async (cid) => {
          feedMultiplierMap[String(cid)] = await ghostBanService.getFeedRankingMultiplier(cid);
        })
      );
      items = items.filter((i) => (feedMultiplierMap[String(i.creatorId || i.stream?.userId)] ?? 1) > 0);
      items = items.sort((a, b) => (feedMultiplierMap[String(b.creatorId || b.stream?.userId)] ?? 0) - (feedMultiplierMap[String(a.creatorId || a.stream?.userId)] ?? 0));
      // Trend eligibility: exclude content with Content Authenticity Score < 60 from trending feed
      if (feedType === 'trending' && items.length > 0) {
        const contentAuthenticityService = require('../services/contentAuthenticityService');
        const contentIds = items.map((i) => i.id).filter(Boolean);
        const trendingEligibleIds = await contentAuthenticityService.getTrendingEligibleContentIds(contentIds, 'stream');
        items = items.filter((i) => trendingEligibleIds.has(String(i.id)));
      }
      // Feed ranking integration: finalScore = rankingScore * (authenticityScore/100); low authenticity suppresses content
      if (items.length > 0 && feedType !== 'shopping') {
        const contentAuthenticityService = require('../services/contentAuthenticityService');
        const contentIds = items.map((i) => i.id).filter(Boolean);
        const authScoreMap = await contentAuthenticityService.getContentAuthenticityScoreMap(contentIds, 'stream');
        for (const i of items) {
          const rankingScore = i.baseScore ?? i.engagementScore ?? 0;
          const authenticityScore = authScoreMap.get(String(i.id)) ?? contentAuthenticityService.DEFAULT_FEED_AUTHENTICITY_SCORE;
          i.finalScore = contentAuthenticityService.applyAuthenticityToRankingScore(rankingScore, authenticityScore);
        }
        items = items.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
      }
      // Trend hijacking protection: new account + viral hashtag → lower weight; low trust + trending tag → suppressed
      if (items.length > 0 && feedType !== 'shopping') {
        const trendHijackingService = require('../services/trendHijackingService');
        const hijackMap = await trendHijackingService.getTrendHijackingMultipliersForItems(items);
        for (const i of items) {
          const mult = hijackMap.get(String(i.id)) ?? 1;
          i.finalScore = (i.finalScore ?? 0) * mult;
        }
        items = items.filter((i) => (i.finalScore ?? 0) > 0);
        items = items.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
      }
      // Integration with feed algorithm: finalScore = contentScore * (creatorReputation/100); low reputation → reduced reach
      if (items.length > 0 && feedType !== 'shopping') {
        const creatorReputationService = require('../services/creatorReputationService');
        const creatorIds = [...new Set(items.map((i) => i.creatorId || i.stream?.userId).filter(Boolean))];
        const crsMap = await creatorReputationService.getCreatorReputationScoreMap(creatorIds);
        for (const i of items) {
          const cid = String(i.creatorId || i.stream?.userId);
          const crs = crsMap.get(cid) ?? creatorReputationService.DEFAULT_FEED_CRS_SCORE;
          i.finalScore = (i.finalScore ?? 0) * (crs / 100);
        }
        items = items.filter((i) => (i.finalScore ?? 0) > 0);
        items = items.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
      }
      items = await applyViralSoundBoost(items, feedType);
      if (needsSaturation) items = await applySoundSaturationCap(items, lim);
      if (feedType === 'shopping') {
        return reply.send({ ok: true, items, feedType, limit: Number(limit), offset: Number(offset) });
      }
      const paidStreamIds = items.filter((i) => i.stream?.visibility === 'paid').map((i) => i.id);
      const unlockedSet = await getUnlockedStreamIds(user?._id, paidStreamIds);
      const result = items.map((r) => {
        const stream = r.stream;
        const ppv = stream ? applyPpvGating(stream, user?._id, unlockedSet) : { priceCents: null, isLocked: false, streamUrl: null };
        return {
          id: r.id,
          type: r.type,
          title: r.title,
          creator: r.creator,
          creatorId: r.creatorId,
          avatarUrl: r.avatarUrl,
          viewers: r.viewers,
          category: r.category,
          thumbnailUrl: r.thumbnailUrl,
          priceCents: ppv.priceCents,
          isLocked: ppv.isLocked,
          streamUrl: r.type === 'live' ? ppv.streamUrl : null,
          recordingUrl: stream?.recordingUrl || stream?.meta?.recordingUrl || null,
          status: stream?.status || r.type,
        };
      });
      if (feedType === 'shorts' && result.length > 0) {
        const streamIds = result.map((r) => r.id);
        const links = await db.VideoProduct.find({ contentId: { $in: streamIds } })
          .sort({ sortOrder: 1 })
          .populate('productId')
          .lean();
        const byStream = {};
        for (const l of links) {
          const p = l.productId;
          if (!p || p.status !== 'active') continue;
          const sid = String(l.contentId);
          if (!byStream[sid]) byStream[sid] = [];
          byStream[sid].push({
            id: p._id,
            name: p.name,
            priceCents: p.priceCents,
            imageUrls: p.imageUrls || [],
            position: l.position || { x: 20, y: 80 },
          });
        }
        for (const r of result) {
          r.shopProducts = byStream[String(r.id)] || [];
        }
      }
      return reply.send({ ok: true, items: result, feedType, limit: lim, offset: Number(offset) });
    } catch (err) {
      if (err.message === 'INVALID_FEED_TYPE') return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  /* ── For You feed ── */
  app.get('/content/feed', async (request, reply) => {
    const { tab = 'foryou', category = 'all', limit = 20, offset = 0 } = request.query ?? {};
    const user = await authUser(request).catch(() => null);
    const lim = Math.min(Number(limit) || 20, 50);
    const off = Number(offset) || 0;

    if (tab === 'foryou' || tab === 'shorts') {
      const region = request.region || {};
      const regionCode = region.user_compliance_zone || region.user_country || 'US';
      const access = user ? await compliance.canAccessContent(user._id, 'explicit', regionCode) : { allowed: false };
      const contentFilter = compliance.contentFilterForUser(access.allowed);
      const feedType = tab === 'shorts' ? 'shorts' : 'global';
      const requestLimit = Math.min(lim * 3, 150);
      let items = await discoveryService.getFeed(feedType, {
        userId: user?._id,
        limit: requestLimit,
        offset: off,
        region,
        contentFilter,
      });
      const ghostBanService = require('../services/ghostBanService');
      const forYouCreatorIds = [...new Set(items.map((i) => i.creatorId || i.stream?.userId).filter(Boolean))];
      const forYouMultiplierMap = {};
      await Promise.all(
        forYouCreatorIds.map(async (cid) => {
          forYouMultiplierMap[String(cid)] = await ghostBanService.getFeedRankingMultiplier(cid);
        })
      );
      items = items.filter((i) => (forYouMultiplierMap[String(i.creatorId || i.stream?.userId)] ?? 1) > 0);
      items = items.sort((a, b) => (forYouMultiplierMap[String(b.creatorId || b.stream?.userId)] ?? 0) - (forYouMultiplierMap[String(a.creatorId || a.stream?.userId)] ?? 0));
      // Feed ranking: finalScore = rankingScore * (authenticityScore/100)
      if (items.length > 0) {
        const contentAuthenticityService = require('../services/contentAuthenticityService');
        const contentIds = items.map((i) => i.id).filter(Boolean);
        const authScoreMap = await contentAuthenticityService.getContentAuthenticityScoreMap(contentIds, 'stream');
        for (const i of items) {
          const rankingScore = i.baseScore ?? i.engagementScore ?? 0;
          const authenticityScore = authScoreMap.get(String(i.id)) ?? contentAuthenticityService.DEFAULT_FEED_AUTHENTICITY_SCORE;
          i.finalScore = contentAuthenticityService.applyAuthenticityToRankingScore(rankingScore, authenticityScore);
        }
        items = items.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
      }
      // Trend hijacking protection: new account + viral tag → lower weight; low trust + trending tag → suppressed
      if (items.length > 0) {
        const trendHijackingService = require('../services/trendHijackingService');
        const hijackMap = await trendHijackingService.getTrendHijackingMultipliersForItems(items);
        for (const i of items) {
          const mult = hijackMap.get(String(i.id)) ?? 1;
          i.finalScore = (i.finalScore ?? 0) * mult;
        }
        items = items.filter((i) => (i.finalScore ?? 0) > 0);
        items = items.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
      }
      // Integration with feed algorithm: finalScore = contentScore * (creatorReputation/100); low reputation → reduced reach
      if (items.length > 0) {
        const creatorReputationService = require('../services/creatorReputationService');
        const forYouCreatorIds = [...new Set(items.map((i) => i.creatorId || i.stream?.userId).filter(Boolean))];
        const crsMap = await creatorReputationService.getCreatorReputationScoreMap(forYouCreatorIds);
        for (const i of items) {
          const cid = String(i.creatorId || i.stream?.userId);
          const crs = crsMap.get(cid) ?? creatorReputationService.DEFAULT_FEED_CRS_SCORE;
          i.finalScore = (i.finalScore ?? 0) * (crs / 100);
        }
        items = items.filter((i) => (i.finalScore ?? 0) > 0);
        items = items.sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
      }
      items = await applyViralSoundBoost(items, feedType);
      items = await applySoundSaturationCap(items, lim);
      const paidStreamIds = items.filter((i) => i.stream?.visibility === 'paid').map((i) => i.id);
      const unlockedSet = await getUnlockedStreamIds(user?._id, paidStreamIds);
      const result = items.map((r) => {
        const stream = r.stream;
        const ppv = stream ? applyPpvGating(stream, user?._id, unlockedSet) : { priceCents: null, isLocked: false, streamUrl: null };
        return {
          id: r.id,
          type: r.type,
          title: r.title,
          creator: r.creator,
          creatorId: r.creatorId,
          avatarUrl: r.avatarUrl,
          viewers: r.viewers,
          category: r.category,
          thumbnailUrl: r.thumbnailUrl,
          priceCents: ppv.priceCents,
          isLocked: ppv.isLocked,
          streamUrl: r.type === 'live' ? ppv.streamUrl : null,
          recordingUrl: stream?.recordingUrl || stream?.meta?.recordingUrl || null,
          status: stream?.status || r.type,
        };
      });
      if (tab === 'shorts' && result.length > 0) {
        const streamIds = result.map((r) => r.id);
        const links = await db.VideoProduct.find({ contentId: { $in: streamIds } })
          .sort({ sortOrder: 1 })
          .populate('productId')
          .lean();
        const byStream = {};
        for (const l of links) {
          const p = l.productId;
          if (!p || p.status !== 'active') continue;
          const sid = String(l.contentId);
          if (!byStream[sid]) byStream[sid] = [];
          byStream[sid].push({
            id: p._id,
            name: p.name,
            priceCents: p.priceCents,
            imageUrls: p.imageUrls || [],
            position: l.position || { x: 20, y: 80 },
          });
        }
        for (const r of result) {
          r.shopProducts = byStream[String(r.id)] || [];
        }
      }
      return reply.send({ ok: true, items: result, total: result.length, limit: lim, offset: off });
    }

    let query = {};
    let eventCreatorIds = null;
    if (tab === 'live') {
      query = { status: 'live', visibility: 'public' };
    } else if (tab === 'following' && user) {
      const follows = await db.Follow.find({ followerId: user._id }).lean();
      const ids = follows.map((f) => f.followingId);
      query = { userId: { $in: ids }, status: { $in: ['live', 'scheduled'] } };
      eventCreatorIds = ids;
    } else {
      query = { status: { $in: ['live', 'scheduled'] } };
    }

    const [streams, total, upcomingEvents] = await Promise.all([
      db.LiveStream.find(query)
        .sort({ createdAt: -1 }).skip(off).limit(lim).lean(),
      db.LiveStream.countDocuments(query),
      (() => {
        const eq = { status: 'scheduled', scheduledStart: { $gte: new Date() } };
        if (eventCreatorIds?.length) eq.creatorId = { $in: eventCreatorIds };
        return db.LiveEvent.find(eq).sort({ scheduledStart: 1 }).limit(Math.min(lim, 15)).lean();
      })(),
    ]);

    const paidStreamIds = streams.filter((s) => s.visibility === 'paid').map((s) => s._id);
    const unlockedSet = await getUnlockedStreamIds(user?._id, paidStreamIds);

    const userIds = [...new Set(streams.map((s) => String(s.userId)))];
    const [profiles, levels, trustScores, viewers, accelerators] = await Promise.all([
      db.Profile.find({ userId: { $in: userIds } }).lean(),
      db.Level.find({ userId: { $in: userIds } }).lean(),
      db.TrustScore.aggregate([
        { $match: { userId: { $in: userIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
        { $group: { _id: '$userId', score: { $sum: '$score' } } },
      ]),
      streams.length
        ? db.LiveViewer.aggregate([
            { $match: { streamId: { $in: streams.map((s) => s._id) }, active: true } },
            { $group: { _id: '$streamId', count: { $sum: 1 } } },
          ]).catch(() => [])
        : [],
      db.CreatorAccelerator.find({ creatorId: { $in: userIds } }).select('creatorId algorithmBoost featured').lean(),
    ]);

    const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const levelMap = Object.fromEntries(levels.map((l) => [String(l.userId), l.level ?? 1]));
    const trustMap = Object.fromEntries(trustScores.map((t) => [String(t._id), Math.max(0, t.score ?? 0)]));
    const viewerMap = Object.fromEntries(viewers.map((v) => [String(v._id), v.count]));
    const accelMap = Object.fromEntries((accelerators || []).map((a) => [String(a.creatorId), a]));

    const liveGhostBan = require('../services/ghostBanService');
    const discoverabilityMap = {};
    await Promise.all(
      userIds.map(async (cid) => {
        discoverabilityMap[String(cid)] = await liveGhostBan.getLiveDiscoverabilityMultiplier(cid);
      })
    );

    const eventCreatorIdsList = [...new Set(upcomingEvents.map((e) => String(e.creatorId)))];
    const eventProfiles = eventCreatorIdsList.length
      ? await db.Profile.find({ userId: { $in: eventCreatorIdsList } }).lean()
      : [];
    const eventProfMap = Object.fromEntries(eventProfiles.map((p) => [String(p.userId), p]));
    const [attendanceByEvent, ticketByEvent, chatByEvent] = upcomingEvents.length
      ? await Promise.all([
          db.EventAttendance.aggregate([
            { $match: { eventId: { $in: upcomingEvents.map((e) => e._id) } } },
            { $group: { _id: '$eventId', count: { $sum: 1 } } },
          ]).catch(() => []),
          db.EventAttendance.aggregate([
            { $match: { eventId: { $in: upcomingEvents.map((e) => e._id) }, ticketPaid: true } },
            { $group: { _id: '$eventId', count: { $sum: 1 } } },
          ]).catch(() => []),
          db.EventComment.aggregate([
            { $match: { eventId: { $in: upcomingEvents.map((e) => e._id) } } },
            { $group: { _id: '$eventId', count: { $sum: 1 } } },
          ]).catch(() => []),
        ])
      : [[], [], []];
    const attMap = Object.fromEntries(attendanceByEvent.map((a) => [String(a._id), a.count]));
    const ticketMap = Object.fromEntries(ticketByEvent.map((t) => [String(t._id), t.count]));
    const chatMap = Object.fromEntries(chatByEvent.map((c) => [String(c._id), c.count]));

    const rankItems = streams.map((s) => {
      const creatorId = String(s.userId);
      const viewerCount = viewerMap[String(s._id)] ?? s.meta?.viewerCount ?? 0;
      const discoverability = discoverabilityMap[creatorId] ?? 1;
      const accel = accelMap[creatorId];
      const algorithmBoost = accel?.algorithmBoost ?? 0;
      return {
        id: s._id,
        baseScore: s.status === 'live' ? Math.max(0, Math.round(viewerCount * discoverability)) : 0,
        level: levelMap[creatorId] ?? 1,
        trust: trustMap[creatorId] ?? 0,
        algorithmBoost,
        featured: accel?.featured ?? false,
        shadowBanned: profMap[creatorId]?.shadowBanned ?? false,
        type: s.status === 'live' ? 'live' : 'scheduled',
        title: s.title || 'Stream',
        creator: profMap[creatorId]?.displayName || 'Creator',
      creatorId: s.userId,
        avatarUrl: profMap[creatorId]?.avatarUrl,
        viewers: viewerCount,
      category: s.meta?.category ?? 'general',
      thumbnailUrl: s.meta?.thumbnailUrl,
        priceCents: null,
        isLocked: false,
        streamUrl: null,
      };
    });

    const eventRankItems = upcomingEvents.map((e) => {
      const cid = String(e.creatorId);
      const att = attMap[String(e._id)] ?? 0;
      const tickets = ticketMap[String(e._id)] ?? 0;
      const chat = chatMap[String(e._id)] ?? 0;
      const baseScore = att * 2 + tickets * 5 + chat;
      return {
        id: e._id,
        baseScore,
        level: levelMap[cid] ?? 1,
        trust: trustMap[cid] ?? 0,
        algorithmBoost: accelMap[cid]?.algorithmBoost ?? 0,
        featured: accelMap[cid]?.featured ?? false,
        shadowBanned: eventProfMap[cid]?.shadowBanned ?? false,
        type: 'event',
        title: e.title || 'Live Event',
        creator: eventProfMap[cid]?.displayName || 'Creator',
        creatorId: e.creatorId,
        avatarUrl: eventProfMap[cid]?.avatarUrl,
        viewers: att,
        category: 'event',
        thumbnailUrl: e.thumbnailUrl,
        priceCents: e.ticketPriceCents ?? 0,
        isLocked: false,
        streamUrl: null,
      };
    });

    let ranked = rankLive([...rankItems, ...eventRankItems]);
    const ghostBanService = require('../services/ghostBanService');
    const creatorIdsRanked = [...new Set(ranked.map((r) => String(r.creatorId)).filter(Boolean))];
    const multiplierMap = {};
    await Promise.all(
      creatorIdsRanked.map(async (cid) => {
        multiplierMap[cid] = await ghostBanService.getFeedRankingMultiplier(cid);
      })
    );
    ranked = ranked.sort((a, b) => (multiplierMap[String(b.creatorId)] ?? 0) - (multiplierMap[String(a.creatorId)] ?? 0));
    const streamMap = Object.fromEntries(streams.map((s) => [String(s._id), s]));
    const eventMap = Object.fromEntries(upcomingEvents.map((e) => [String(e._id), e]));

    const items = ranked.map((r) => {
      const stream = streamMap[String(r.id)];
      const event = eventMap[String(r.id)];
      const ppv = stream ? applyPpvGating(stream, user?._id, unlockedSet) : { priceCents: r.priceCents ?? null, isLocked: false, streamUrl: null };
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        creator: r.creator,
        creatorId: r.creatorId,
        avatarUrl: r.avatarUrl,
        viewers: r.viewers,
        category: r.category,
        thumbnailUrl: r.thumbnailUrl,
        priceCents: event ? (event.ticketPriceCents ?? 0) : ppv.priceCents,
        isLocked: ppv.isLocked,
        streamUrl: r.type === 'live' ? ppv.streamUrl : null,
      };
    });

    return reply.send({ ok: true, items, total: total + upcomingEvents.length, limit: lim, offset: off });
  });

  /* ── Search ── */
  app.get('/content/search', async (request, reply) => {
    return reply.send(await runContentSearchQuery(request));
  });

  app.get('/content/search/advanced', async (request, reply) => {
    const payload = await runContentSearchQuery(request);
    return reply.send({ ...payload, searchMode: 'advanced' });
  });

  /* ── Phase 7: Stream engagement (like, share, comment) ── */
  app.post('/content/streams/:streamId/like', { config: { rateLimit: LIKES_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.streamId, reply)) return;
    const existing = await db.StreamLike.findOne({ streamId: request.params.streamId, userId: user._id });
    if (existing) return reply.send({ ok: true, liked: true });
    await db.StreamLike.create({ streamId: request.params.streamId, userId: user._id });
    await db.ContentEngagement.findOneAndUpdate(
      { contentId: request.params.streamId, contentType: 'stream' },
      { $inc: { likes: 1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
    require('../services/contentAuthenticityService').updateContentAuthenticityScore(request.params.streamId, 'stream').catch(() => {});
    const sid = String(request.params.streamId);
    kafkaEventBus.publish(kafkaEventBus.TOPICS.VIDEO_LIKE, { contentId: sid, streamId: sid, delta: 1 }).catch(() => {});
    return reply.send({ ok: true, liked: true });
  });

  app.delete('/content/streams/:streamId/like', { config: { rateLimit: LIKES_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.streamId, reply)) return;
    await db.StreamLike.deleteOne({ streamId: request.params.streamId, userId: user._id });
    await db.ContentEngagement.findOneAndUpdate(
      { contentId: request.params.streamId, contentType: 'stream' },
      { $inc: { likes: -1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
    const sid = String(request.params.streamId);
    kafkaEventBus.publish(kafkaEventBus.TOPICS.VIDEO_LIKE, { contentId: sid, streamId: sid, delta: -1 }).catch(() => {});
    return reply.send({ ok: true, liked: false });
  });

  app.post('/content/streams/:streamId/share', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.streamId, reply)) return;
    const { platform } = request.body ?? {};
    await db.StreamShare.create({ streamId: request.params.streamId, userId: user._id, platform });
    await db.ContentEngagement.findOneAndUpdate(
      { contentId: request.params.streamId, contentType: 'stream' },
      { $inc: { shares: 1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
    const { logActivity } = require('../lib/activityService');
    logActivity(user._id, 'content_share', request.params.streamId).catch(() => {});
    return reply.send({ ok: true });
  });

  /* ── Phase 12: Engagement metrics (views, watch_time, completion_rate, shares). regionCounts for geographic trend. ── */
  const TRENDING_REGION_CODES = ['US', 'BR', 'IN', 'UK', 'EU'];
  function normalizeRegionCode(countryOrZone) {
    const c = (countryOrZone || 'US').toString().toUpperCase().slice(0, 2);
    if (TRENDING_REGION_CODES.includes(c)) return c;
    if (c === 'GB') return 'UK';
    return 'US';
  }
  app.post('/content/streams/:streamId/view', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const stream = await db.LiveStream.findById(request.params.streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    const user = await authUser(request).catch(() => null);
    const regionCode = normalizeRegionCode(request.region?.user_country || request.region?.user_compliance_zone);
    const inc = { viewCount: 1, ...(regionCode ? { [`regionCounts.${regionCode}`]: 1 } : {}) };
    await db.ContentEngagement.findOneAndUpdate(
      { contentId: request.params.streamId, contentType: 'stream' },
      { $inc: inc, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
    if (user?._id) {
      const { logActivity } = require('../lib/activityService');
      logActivity(user._id, 'content_view', request.params.streamId).catch(() => {});
    }
    const sid = String(request.params.streamId);
    kafkaEventBus.publish(kafkaEventBus.TOPICS.VIDEO_VIEW, { contentId: sid, streamId: sid, viewsDelta: 1 }).catch(() => {});
    return reply.send({ ok: true, counted: true });
  });

  /* ── Record play (including rewatch) for loop_rate = total_plays / total_views. Call on each play; call /view once per view. ── */
  app.post('/content/streams/:streamId/play', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const stream = await db.LiveStream.findById(request.params.streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    await db.ContentEngagement.findOneAndUpdate(
      { contentId: request.params.streamId, contentType: 'stream' },
      { $inc: { playCount: 1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
    return reply.send({ ok: true, counted: true });
  });

  app.post('/content/streams/:streamId/watch', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const stream = await db.LiveStream.findById(request.params.streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    const watchSecondsRaw = Number(request.body?.watchSeconds ?? request.body?.watch_time ?? 0);
    if (!Number.isFinite(watchSecondsRaw) || watchSecondsRaw < 0) {
      return reply.status(400).send({ error: 'INVALID_WATCH_TIME' });
    }
    const completed = request.body?.completed === true || request.body?.completion === true;
    const watchSeconds = Math.min(Math.round(watchSecondsRaw), 6 * 60 * 60);
    const update = {
      $inc: { watchTimeSeconds: watchSeconds, ...(completed ? { completedViews: 1 } : {}) },
      $set: { lastUpdated: new Date() },
    };
    const doc = await db.ContentEngagement.findOneAndUpdate(
      { contentId: request.params.streamId, contentType: 'stream' },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const viewCount = Math.max(0, Number(doc?.viewCount || 0));
    const completedViews = Math.max(0, Number(doc?.completedViews || 0));
    const completionRate = viewCount > 0 ? Number(((completedViews / viewCount) * 100).toFixed(2)) : 0;
    await db.ContentEngagement.updateOne(
      { _id: doc._id },
      { $set: { completionRate } }
    );
    const sid = String(request.params.streamId);
    kafkaEventBus.publish(kafkaEventBus.TOPICS.VIDEO_VIEW, {
      contentId: sid,
      streamId: sid,
      viewsDelta: 0,
      watchSeconds,
    }).catch(() => {});
    return reply.send({
      ok: true,
      watch_time: Number(doc?.watchTimeSeconds || 0),
      completion_rate: completionRate,
    });
  });

  app.post('/content/streams/:streamId/comments', { config: { rateLimit: COMMENTS_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.streamId, reply)) return;
    const { text } = request.body ?? {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return reply.status(400).send({ error: 'TEXT_REQUIRED' });
    }
    await db.StreamComment.create({ streamId: request.params.streamId, userId: user._id, text: text.trim().slice(0, 500) });
    await db.ContentEngagement.findOneAndUpdate(
      { contentId: request.params.streamId, contentType: 'stream' },
      { $inc: { comments: 1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
    require('../services/contentAuthenticityService').updateContentAuthenticityScore(request.params.streamId, 'stream').catch(() => {});
    return reply.send({ ok: true });
  });

  app.post('/content/streams/:streamId/save', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.streamId, reply)) return;
    const existing = await db.ContentBookmark.findOne({ contentId: request.params.streamId, userId: user._id });
    if (existing) return reply.send({ ok: true, saved: true });
    await db.ContentBookmark.create({ contentId: request.params.streamId, userId: user._id, contentType: 'stream' });
    await db.ContentEngagement.findOneAndUpdate(
      { contentId: request.params.streamId, contentType: 'stream' },
      { $inc: { saves: 1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
    return reply.send({ ok: true, saved: true });
  });

  app.delete('/content/streams/:streamId/save', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.streamId, reply)) return;
    await db.ContentBookmark.deleteOne({ contentId: request.params.streamId, userId: user._id });
    await db.ContentEngagement.findOneAndUpdate(
      { contentId: request.params.streamId, contentType: 'stream' },
      { $inc: { saves: -1 }, $set: { lastUpdated: new Date() } },
      { upsert: true }
    );
    return reply.send({ ok: true, saved: false });
  });

  app.get('/content/streams/:streamId/engagement', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = await authUser(request);
    const streamId = request.params.streamId;
    const [engagement, liked, saved] = await Promise.all([
      db.ContentEngagement.findOne({ contentId: streamId, contentType: 'stream' }).lean(),
      user ? db.StreamLike.findOne({ streamId, userId: user._id }).lean() : null,
      user ? db.ContentBookmark.findOne({ contentId: streamId, userId: user._id }).lean() : null,
    ]);
    const views = engagement?.viewCount ?? 0;
    const plays = engagement?.playCount ?? 0;
    const loop_rate = views > 0 ? (plays / views) : 0;
    return reply.send({
      views,
      plays,
      loop_rate: Math.round(loop_rate * 100) / 100,
      watch_time: engagement?.watchTimeSeconds ?? 0,
      completion_rate: engagement?.completionRate ?? 0,
      likes: engagement?.likes ?? 0,
      shares: engagement?.shares ?? 0,
      comments: engagement?.comments ?? 0,
      saves: engagement?.saves ?? 0,
      liked: !!liked,
      saved: !!saved,
    });
  });

  app.get('/content/streams/:streamId/comments', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const comments = await db.StreamComment.find({ streamId: request.params.streamId })
      .sort({ createdAt: -1 })
      .limit(limit * 2)
      .populate('userId', 'email')
      .lean();
    const userIds = [...new Set(comments.map((c) => c.userId?._id || c.userId).filter(Boolean))];
    const ghostBanService = require('../services/ghostBanService');
    const [profiles, commentHiddenSet] = await Promise.all([
      db.Profile.find({ userId: { $in: userIds } }).lean(),
      ghostBanService.getCommentHiddenUserIds(userIds),
    ]);
    const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const filtered = comments.filter((c) => !commentHiddenSet.has(String(c.userId?._id || c.userId)));
    const result = filtered.slice(0, limit).map((c) => ({
      id: c._id,
      text: c.text,
      userId: c.userId,
      displayName: profMap[String(c.userId?._id || c.userId)]?.displayName,
      avatarUrl: profMap[String(c.userId?._id || c.userId)]?.avatarUrl,
      createdAt: c.createdAt,
    }));
    return reply.send({ comments: result });
  });

  /* ── Shop the look — products linked to video ── */
  app.get('/content/streams/:streamId/products', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const links = await db.VideoProduct.find({ contentId: request.params.streamId })
      .sort({ sortOrder: 1, createdAt: 1 })
      .populate('productId')
      .lean();
    const products = links
      .filter((l) => l.productId && l.productId.status === 'active')
      .map((l) => ({
        id: l.productId._id,
        name: l.productId.name,
        priceCents: l.productId.priceCents,
        imageUrls: l.productId.imageUrls || [],
        position: l.position || { x: 20, y: 80 },
      }));
    return reply.send({ products });
  });

  app.post('/content/streams/:streamId/products', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.streamId, reply)) return;
    const { productId, position } = request.body ?? {};
    if (!productId) return reply.status(400).send({ error: 'PRODUCT_ID_REQUIRED' });
    if (!validateId(productId, reply)) return;
    const stream = await db.LiveStream.findById(request.params.streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (String(stream.userId) !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN' });
    const product = await db.Product.findOne({ _id: productId, creatorId: user._id, status: 'active' }).lean();
    if (!product) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND' });
    const existing = await db.VideoProduct.findOne({ contentId: request.params.streamId, productId });
    if (existing) return reply.status(400).send({ error: 'ALREADY_LINKED' });
    const pos = { x: Math.max(0, Math.min(100, Number(position?.x) || 20)), y: Math.max(0, Math.min(100, Number(position?.y) || 80)) };
    const link = await db.VideoProduct.create({ contentId: request.params.streamId, productId, position: pos });
    return reply.status(201).send({ ok: true, link: { id: link._id, productId, position: pos } });
  });

  app.delete('/content/streams/:streamId/products/:productId', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.streamId, reply)) return;
    if (!validateId(request.params.productId, reply)) return;
    const stream = await db.LiveStream.findById(request.params.streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (String(stream.userId) !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN' });
    await db.VideoProduct.deleteOne({ contentId: request.params.streamId, productId: request.params.productId });
    return reply.send({ ok: true });
  });

  /* ── Report short / stream ── */
  app.post('/content/streams/:videoId/report', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.videoId, reply)) return;

    const { videoId } = request.params;
    const { reason, description } = request.body ?? {};
    const validReasons = ['spam', 'harassment', 'nudity', 'violence', 'misinformation', 'hate_speech', 'illegal_content', 'scam', 'copyright_violation', 'other'];
    if (!reason || !validReasons.includes(reason)) return reply.status(400).send({ error: 'INVALID_REASON', valid: validReasons });

    const stream = await db.LiveStream.findById(videoId).lean();
    if (!stream) return reply.status(404).send({ error: 'VIDEO_NOT_FOUND' });

    const existing = await db.Report.findOne({ reporterId: user._id, targetType: 'stream', targetId: videoId });
    if (existing) return reply.status(409).send({ error: 'ALREADY_REPORTED' });

    await db.Report.create({
      reporterId: user._id,
      targetType: 'stream',
      targetId: videoId,
      reason,
      description: (description || '').slice(0, 2000),
      status: 'open',
    });
    return reply.status(201).send({ success: true });
  });

  /* ── Report content (stream, short, user, etc.) ── */
  app.post('/content/report', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { targetType, targetId, reason, description } = request.body ?? {};
    const validTypes = ['stream', 'user', 'message', 'product', 'auction', 'comment', 'content'];
    const validReasons = ['spam', 'harassment', 'nudity', 'violence', 'misinformation', 'hate_speech', 'illegal_content', 'scam', 'copyright_violation', 'other'];
    if (!targetType || !validTypes.includes(targetType)) return reply.status(400).send({ error: 'INVALID_TARGET_TYPE', valid: validTypes });
    if (!targetId || typeof targetId !== 'string') return reply.status(400).send({ error: 'TARGET_ID_REQUIRED' });
    if (!reason || !validReasons.includes(reason)) return reply.status(400).send({ error: 'INVALID_REASON', valid: validReasons });

    const existing = await db.Report.findOne({ reporterId: user._id, targetType, targetId });
    if (existing) return reply.status(400).send({ error: 'ALREADY_REPORTED' });

    await db.Report.create({
      reporterId: user._id,
      targetType,
      targetId: String(targetId).slice(0, 100),
      reason,
      description: (description || '').slice(0, 2000),
      status: 'open',
    });
    return reply.status(201).send({ ok: true });
  });

  /* ── Badge definitions (platform badges for creator trust) ── */
  app.get('/content/badges', async (request, reply) => {
    const badges = await db.CreatorBadge.find({ active: true })
      .sort({ sortOrder: 1, badgeId: 1 })
      .select('badgeId label icon description')
      .lean();
    return reply.send({ ok: true, badges });
  });

  /* ── Creator directory (discovery grid) — sort: trending | top_earning | live_now ── */
  app.get('/content/creators/discover', async (request, reply) => {
    const sort = (request.query.sort || 'trending').toString();
    const category = request.query.category;
    const liveOnly = request.query.live === 'true' || request.query.live === '1';
    const limit = Math.min(Number(request.query.limit) || 24, 60);
    const offset = Math.max(Number(request.query.offset) || 0, 0);

    const approvedUsers = await db.User.find({
      creatorStatus: 'approved',
      status: 'active',
      shadowBanned: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .select('_id')
      .lean();

    let idList = approvedUsers.map((u) => u._id);
    if (!idList.length) {
      return reply.send({ ok: true, creators: [], total: 0, limit, offset, sort });
    }

    if (category && category !== 'all') {
      const uidInCat = await db.LiveStream.distinct('userId', {
        category,
        removedAt: null,
      });
      const catSet = new Set(uidInCat.map(String));
      idList = idList.filter((id) => catSet.has(String(id)));
    }

    const liveStreams = await db.LiveStream.find({ status: 'live', removedAt: null })
      .select('userId _id')
      .lean();
    const liveByUser = Object.fromEntries(liveStreams.map((s) => [String(s.userId), String(s._id)]));
    const liveUids = new Set(Object.keys(liveByUser));

    if (liveOnly) {
      idList = idList.filter((id) => liveUids.has(String(id)));
    }

    const followerAgg = await db.Follow.aggregate([
      { $match: { followingId: { $in: idList } } },
      { $group: { _id: '$followingId', followerCount: { $sum: 1 } } },
    ]);
    const followerMap = Object.fromEntries(followerAgg.map((x) => [String(x._id), x.followerCount]));

    const profiles = await db.Profile.find({
      userId: { $in: idList },
      shadowBanned: { $ne: true },
    })
      .select('userId displayName avatarUrl bio meta')
      .lean();
    const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));

    let rows = idList
      .map((id) => {
        const p = profMap[String(id)];
        if (!p) return null;
        const uid = String(id);
        return {
          userId: id,
          displayName: p.displayName || 'Creator',
          handle: p.meta?.username || '',
          avatarUrl: p.avatarUrl || null,
          bio: p.bio || '',
          followerCount: followerMap[uid] || 0,
          isLive: liveUids.has(uid),
          liveStreamId: liveByUser[uid] || null,
          earningsCents: Number(p.meta?.totalEarningsCents) || 0,
        };
      })
      .filter(Boolean);

    if (sort === 'live_now') {
      rows.sort((a, b) => Number(b.isLive) - Number(a.isLive) || b.followerCount - a.followerCount);
    } else if (sort === 'top_earning') {
      rows.sort((a, b) => b.earningsCents - a.earningsCents || b.followerCount - a.followerCount);
    } else {
      rows.sort((a, b) => b.followerCount - a.followerCount);
    }

    const total = rows.length;
    const slice = rows.slice(offset, offset + limit);
    const creators = slice.map(({ earningsCents, ...rest }) => rest);

    return reply.send({ ok: true, creators, total, limit, offset, sort });
  });

  /* ── Creator public profile ── */
  app.get('/content/creators/:id', async (request, reply) => {
    const { id } = request.params;
    if (!validateId(id, reply)) return;
    const [user, profile] = await Promise.all([
      db.User.findById(id).lean().catch(() => null),
      db.Profile.findOne({ userId: id }).lean().catch(() => null),
    ]);
    if (!user || !profile) return reply.status(404).send({ error: 'NOT_FOUND' });

    const [followers, following, streams, eventReplays, upcomingEvents] = await Promise.all([
      db.Follow.countDocuments({ followingId: id }),
      db.Follow.countDocuments({ followerId: id }),
      db.LiveStream.find({ userId: id, status: { $in: ['live', 'scheduled', 'ended'] }, removedAt: null })
        .sort({ createdAt: -1 }).limit(20).lean(),
      db.LiveEvent.find({ creatorId: id, status: 'completed', replayUrl: { $ne: null, $exists: true } })
        .sort({ scheduledStart: -1 }).limit(20).lean(),
      db.LiveEvent.find({ creatorId: id, status: 'scheduled', scheduledStart: { $gte: new Date() } })
        .sort({ scheduledStart: 1 }).limit(10).lean(),
    ]);

    const me = await authUser(request).catch(() => null);

    const [subs, isFollowing, isSubscribed] = await Promise.all([
      db.Subscription.countDocuments({ creatorId: id, status: 'active' }).catch(() => 0),
      me ? db.Follow.exists({ followerId: me._id, followingId: id }).catch(() => false) : Promise.resolve(false),
      me ? db.Subscription.exists({ userId: me._id, creatorId: id, status: 'active' }).catch(() => false) : Promise.resolve(false),
    ]);

    return reply.send({
      ok: true,
      creator: {
        id:          user._id,
        displayName: profile.displayName,
        username:    profile.meta?.username,
        avatarUrl:   profile.avatarUrl,
        bio:         profile.bio,
        badges:      (profile.badges || []).map((b) => ({ badgeId: b.badgeId, label: b.label || b.badgeId, icon: b.icon })),
        externalLinks: profile.externalLinks,
        isFollowing:  Boolean(isFollowing),
        isSubscribed: Boolean(isSubscribed),
        stats: { followers, following, subscribers: subs, streams: streams.length },
        streams: streams.map((s) => ({
          _id: s._id, id: s._id, title: s.title, status: s.status, startedAt: s.startedAt,
          thumbnailUrl: s.meta?.thumbnailUrl, viewers: s.meta?.viewerCount ?? 0,
          recordingUrl: s.recordingUrl ?? s.meta?.recordingUrl ?? null,
        })),
        eventReplays: eventReplays.map((e) => ({
          _id: e._id, id: e._id, title: e.title, status: 'completed', startedAt: e.scheduledStart,
          thumbnailUrl: e.thumbnailUrl, viewers: 0,
          recordingUrl: e.replayUrl, type: 'event',
        })),
        upcomingEvents: upcomingEvents.map((e) => ({
          _id: e._id, id: e._id, title: e.title, status: 'scheduled', scheduledStart: e.scheduledStart,
          thumbnailUrl: e.thumbnailUrl, ticketPriceCents: e.ticketPriceCents ?? 0, eventType: e.eventType,
        })),
      },
    });
  });

  /* ── Update own profile (auth required) ── */
  app.put('/content/profile', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!requireVerifiedUser(user, reply)) return;

    const { displayName, bio, avatarUrl, username, externalLinks } = request.body ?? {};
    const update = {};
    if (displayName !== undefined) update.displayName = displayName;
    if (bio         !== undefined) update.bio         = bio;
    if (avatarUrl   !== undefined) update.avatarUrl   = avatarUrl;
    if (externalLinks !== undefined) update.externalLinks = externalLinks;
    if (username    !== undefined) update['meta.username'] = username;

    const profile = await db.Profile.findOneAndUpdate(
      { userId: user._id },
      { $set: update },
      { new: true, upsert: true }
    ).lean();

    return reply.send({ ok: true, profile });
  });

  /* ── User notifications (auth required) ── */
  app.get('/content/notifications', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { limit = 30, unreadOnly, page = 1, type } = request.query ?? {};
    const safeLimit  = Math.min(Number(limit) || 30, 100);
    const safePage   = Math.max(Number(page)  || 1,  1);
    const offset     = (safePage - 1) * safeLimit;

    const query = { userId: user._id };
    if (unreadOnly === 'true') query.read = false;
    if (type && type !== 'all') query.type = type;

    const [notifications, unreadCount, total] = await Promise.all([
      db.Notification.find(query).sort({ createdAt: -1 }).skip(offset).limit(safeLimit).lean(),
      db.Notification.countDocuments({ userId: user._id, read: false }),
      db.Notification.countDocuments(query),
    ]);

    return reply.send({
      ok: true,
      notifications,
      unreadCount,
      total,
      page:    safePage,
      hasMore: offset + notifications.length < total,
    });
  });

  /* ── Mark notifications read (auth required) ── */
  app.post('/content/notifications/read', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { ids } = request.body ?? {};
    if (ids?.length) {
      await db.Notification.updateMany({ _id: { $in: ids }, userId: user._id }, { $set: { read: true } });
    } else {
      await db.Notification.updateMany({ userId: user._id, read: false }, { $set: { read: true } });
    }
    return reply.send({ ok: true });
  });

  /* ── Creator analytics (auth required) ── */
  app.get('/content/analytics/me', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const uid = user._id;
    const now = new Date();
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const d7  = new Date(now - 7  * 24 * 60 * 60 * 1000);

    const [followers, following, subs, allStreams, ledgerEntries, wallet, newFollowers7d, subsByDay] = await Promise.all([
      db.Follow.countDocuments({ followingId: uid }),
      db.Follow.countDocuments({ followerId: uid }),
      db.Subscription.countDocuments({ creatorId: uid, status: 'active' }).catch(() => 0),
      db.LiveStream.find({ userId: uid }).sort({ startedAt: -1 }).limit(50).lean(),
      db.LedgerEntry.find({ userId: uid, type: 'credit', createdAt: { $gte: d30 } }).lean().catch(() => []),
      db.Wallet.findOne({ userId: uid }).lean().catch(() => null),
      db.Follow.countDocuments({ followingId: uid, createdAt: { $gte: d7 } }).catch(() => 0),
      // Subscriber growth by day over last 30 days
      db.Subscription.aggregate([
        { $match: { creatorId: uid, createdAt: { $gte: d30 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]).catch(() => []),
    ]);

    // Revenue by day over last 30 days
    const revenueByDay = {};
    for (const tx of ledgerEntries) {
      const day = new Date(tx.createdAt).toISOString().slice(0, 10);
      revenueByDay[day] = (revenueByDay[day] || 0) + (tx.amountCents || 0);
    }
    const revenueData = Array.from({ length: 30 }, (_, i) => {
      const d   = new Date(d30.getTime() + i * 86400000);
      const day = d.toISOString().slice(0, 10);
      return { date: day, totalCents: revenueByDay[day] || 0 };
    });
    const totalRevenueCents = ledgerEntries.reduce((s, t) => s + (t.amountCents || 0), 0);

    // Top streams by viewer count
    const topStreams = [...allStreams]
      .sort((a, b) => (b.viewerCount || 0) - (a.viewerCount || 0))
      .slice(0, 5)
      .map((s) => ({
        _id:           s._id,
        title:         s.title,
        status:        s.status,
        startedAt:     s.startedAt,
        endedAt:       s.endedAt,
        viewerCount:   s.viewerCount   || 0,
        peakViewers:   s.peakViewers   || 0,
        totalGiftCoins:s.totalGiftCoins|| 0,
        thumbnailUrl:  s.thumbnailUrl  || null,
        recordingUrl:  s.recordingUrl  || null,
      }));

    // Recent streams (for Streams tab)
    const recentStreams = allStreams.slice(0, 10).map((s) => ({
      _id:        s._id,
      title:      s.title,
      status:     s.status,
      startedAt:  s.startedAt,
      endedAt:    s.endedAt,
      viewerCount:s.viewerCount || 0,
      thumbnailUrl:s.thumbnailUrl || null,
      recordingUrl:s.recordingUrl || null,
    }));

    // Top gift senders (aggregate transactions where type includes "gift")
    const giftTxAgg = await db.LedgerEntry.aggregate([
      { $match: { targetUserId: uid, type: { $regex: /gift/i }, createdAt: { $gte: d30 } } },
      { $group: { _id: '$userId', totalCoins: { $sum: '$amountCents' } } },
      { $sort: { totalCoins: -1 } },
      { $limit: 5 },
    ]).catch(() => []);

    // Enrich gift senders with display names
    const topGifts = await Promise.all(
      giftTxAgg.map(async (g) => {
        const prof = await db.Profile.findOne({ userId: g._id }).lean().catch(() => null);
        return { _id: g._id, displayName: prof?.displayName || 'User', totalCoins: g.totalCoins };
      })
    ).catch(() => []);

    // Subscriber growth chart (30 days)
    const subMap = {};
    for (const s of subsByDay) subMap[s._id] = s.count;
    const subscriberGrowth = Array.from({ length: 30 }, (_, i) => {
      const d   = new Date(d30.getTime() + i * 86400000);
      const day = d.toISOString().slice(0, 10);
      return { date: day, count: subMap[day] || 0 };
    });

    return reply.send({
      ok: true,
      // Flat fields — exactly what CreatorDashboardPage expects
      followers,
      following,
      subscribers:          subs,
      walletBalance:        wallet?.balanceCents ?? 0,
      totalRevenueCents,
      newFollowersThisWeek: newFollowers7d,
      totalStreams:         allStreams.length,
      liveStreams:          allStreams.filter((s) => s.status === 'live').length,
      revenueData,
      subscriberGrowth,
      topStreams,
      topGifts:             topGifts || [],
      recentStreams,
      // Legacy nested shape (kept for backward compatibility)
      analytics: {
        followers,
        following,
        subscribers:     subs,
        balanceCents:    wallet?.balanceCents ?? 0,
        revenue30dCents: totalRevenueCents,
        newFollowers7d,
        streams: {
          total:     allStreams.length,
          live:      allStreams.filter((s) => s.status === 'live').length,
          recent:    recentStreams,
        },
        revenueChart: revenueData.map((d) => ({ date: d.date, revenue: d.totalCents })),
      },
    });
  });

  /* ── Wallet balance ── */
  app.get('/content/wallet', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const wallet = await db.Wallet.findOne({ userId: user._id }).lean();
    return reply.send({ wallet: { balanceCents: wallet?.balanceCents ?? 0 } });
  });

  /* ── PPV unlock — pay to watch a paid stream ── */
  app.post('/content/ppv/unlock', { config: { rateLimit: GIFT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { streamId } = request.body ?? {};
    if (!streamId) return reply.status(400).send({ error: 'streamId required' });
    if (!validateId(streamId, reply)) return;

    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (stream.visibility !== 'paid') return reply.status(400).send({ error: 'NOT_PPV', message: 'Stream is not pay-per-view' });
    const priceCents = stream.priceCents || 0;
    if (priceCents < 1) return reply.status(400).send({ error: 'INVALID_PPV_PRICE', message: 'Stream has no price set' });

    // Creator cannot pay for own stream
    if (stream.userId.toString() === user._id.toString()) {
      return reply.status(400).send({ error: 'OWN_STREAM', message: 'You cannot pay to unlock your own stream' });
    }

    // Phase 9: Payment processor compliance — verify age/ID for mature/explicit before purchase
    const contentCat = stream.contentCategory || 'safe';
    if (contentCat !== 'safe') {
      const regionCode = request.region?.user_compliance_zone || request.region?.user_country || 'US';
      const access = await compliance.canAccessContent(user._id, contentCat, regionCode);
      if (!access.allowed) {
        return reply.status(403).send({
          error: 'AGE_VERIFICATION_REQUIRED',
          reason: access.reason,
          message: 'Age or ID verification required to access this content.',
        });
      }
    }

    const { platformCents, creatorCents } = pricing.splitRevenue(priceCents);

    let httpOut = null;
    let responseBody = null;

    try {
      await withOrderedWalletLocks([String(user._id), String(stream.userId)], async () => {
        const existing = await db.PpvPurchase.findOne({ userId: user._id, streamId }).lean();
        if (existing) {
          httpOut = { status: 200, body: { ok: true, unlocked: true, alreadyHadAccess: true } };
          return;
        }

        const wallet = await db.Wallet.findOne({ userId: user._id });
        if (!wallet) {
          httpOut = { status: 400, body: { error: 'NO_WALLET' } };
          return;
        }
        if (wallet.balanceCents < priceCents) {
          httpOut = {
            status: 402,
            body: { error: 'INSUFFICIENT_COINS', balance: wallet.balanceCents, required: priceCents },
          };
          return;
        }

        wallet.balanceCents -= priceCents;
        await wallet.save();

        try {
          await db.Wallet.findOneAndUpdate(
            { userId: stream.userId },
            { $inc: { balanceCents: creatorCents } },
            { upsert: true }
          );
        } catch (creditErr) {
          request.log.error(
            { err: creditErr, creatorId: String(stream.userId), streamId, creatorCents },
            'CRITICAL: creator wallet credit failed after PPV debit — rolling back'
          );
          await db.Wallet.findOneAndUpdate(
            { userId: user._id },
            { $inc: { balanceCents: priceCents } },
          ).catch((rollbackErr) => request.log.error({ err: rollbackErr }, 'CRITICAL: PPV rollback failed'));
          httpOut = {
            status: 500,
            body: { error: 'PPV_PROCESSING_ERROR', message: 'Payment could not be completed. Your coins have been refunded.' },
          };
          return;
        }

        await db.PpvPurchase.create({
          userId: user._id,
          streamId,
          creatorId: stream.userId,
          amountCents: priceCents,
          meta: { platformCents, creatorCents },
        });

        await appendEntry({
          type: 'debit',
          actorId: user._id,
          amountCents: -priceCents,
          refType: 'ppv_unlock',
          refId: String(streamId),
          meta: { streamId: String(streamId), creatorId: String(stream.userId) },
        }).catch((err) => request.log.error({ err }, 'Failed to write ppv_unlock debit ledger entry'));
        await appendEntry({
          type: 'credit',
          actorId: stream.userId,
          amountCents: creatorCents,
          refType: 'ppv_unlock',
          refId: String(streamId),
          meta: { streamId: String(streamId), viewerId: String(user._id) },
        }).catch((err) => request.log.error({ err }, 'Failed to write ppv_unlock credit ledger entry'));

        responseBody = {
          ok: true,
          unlocked: true,
          streamId,
          priceCents,
          newBalance: wallet.balanceCents,
        };
      });
    } catch (lockErr) {
      if (lockErr instanceof LockContentionError) {
        return reply.status(409).send({ error: lockErr.code || 'REDIS_LOCK_HELD', message: lockErr.message });
      }
      throw lockErr;
    }

    if (httpOut) return reply.status(httpOut.status).send(httpOut.body);
    return reply.send(responseBody);
  });

  /* ── Gift recommendation (AI personalization) ── */
  app.get('/content/gifts/recommend', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const milla = require('@millo/milla');
      const giftId = await milla.recommendGift(user);
      return reply.send({ giftId: giftId || 'rose' });
    } catch (e) {
      request.log.warn({ err: e, userId: String(user._id) }, 'Gift recommendation failed');
      return reply.send({ giftId: 'rose' });
    }
  });

  /* ── List gifts (with type: 2d, 3d, ai) + animationPriority for TikTok-style display ── */
  app.get('/content/gifts', async (_request, reply) => {
    const GIFT_TIERS = { rose: 'common', 'ice-cream': 'common', lollipop: 'common', diamond: 'rare', trophy: 'rare', crown: 'rare', rocket: 'epic', galaxy: 'epic', dragon: 'epic', lion: 'legendary', universe: 'legendary', 'millo-star': 'legendary' };
    const TIER_TO_PRIORITY = { common: 'small', rare: 'small', epic: 'large', legendary: 'fullscreen' };
    const { pricing } = require('@millo/economy');
    const config = pricing.getConfig?.() || {};
    const giftCosts = config.giftCosts || {};
    const dbGifts = await db.Gift.find({ active: true }).lean().catch(() => []);
    const dbMap = Object.fromEntries(dbGifts.map((g) => [g.id, g]));
    const ids = [...new Set([...Object.keys(giftCosts), ...dbGifts.map((g) => g.id)])];
    const gifts = ids.map((id) => {
      const g = dbMap[id];
      const tier = g?.tier ?? GIFT_TIERS[id] ?? 'common';
      const animationPriority = TIER_TO_PRIORITY[tier] ?? 'small';
      return {
        id,
        type: g?.type || '2d',
        cost: g?.cost ?? giftCosts[id] ?? 1,
        label: g?.label || id,
        icon: g?.icon || null,
        tier,
        animationPriority,
      };
    });
    return reply.send({ gifts });
  });

  /* ── Gift send (coin deduction) ── */
  // SECURITY: Never trust client gift data. Sender = authUser(request) only.
  // Uses atomic economy.debit to prevent race-condition double-spend.
  app.post('/content/gifts/send', { config: { rateLimit: GIFT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { requireNoRiskLock, requireNotEnforcementRateLimited } = require('../middleware/riskLock');
    if (!requireNoRiskLock(request, reply)) return;
    if (!(await requireNotEnforcementRateLimited(request, reply))) return;

    const { receiverId, giftId, coins, streamId: streamIdBody, timestamp, fingerprint, nonce } = request.body ?? {};
    if (!receiverId || !giftId || !coins) {
      return reply.status(400).send({ error: 'receiverId, giftId and coins required' });
    }
    if (!validateId(receiverId, reply)) return;
    if (String(user._id) === String(receiverId)) {
      return reply.status(403).send({
        error: 'SELF_GIFT_NOT_ALLOWED',
        message: 'You cannot send gifts to yourself.',
      });
    }
    if (nonce) {
      const { checkAndConsumeNonce } = require('../lib/giftNonce');
      const nonceOk = await checkAndConsumeNonce(nonce);
      if (!nonceOk) {
        return reply.status(400).send({ error: 'REPLAY_DETECTED', message: 'Duplicate request. Please try again.' });
      }
    }
    const ts = timestamp != null ? Number(timestamp) : NaN;
    if (!isNaN(ts) && (Date.now() - ts > 10000 || ts > Date.now() + 5000)) {
      return reply.status(400).send({ error: 'EXPIRED_GIFT_REQUEST', message: 'Request expired. Please try again.' });
    }
    const cost = Number(coins);
    if (isNaN(cost) || cost < 1) return reply.status(400).send({ error: 'INVALID_COINS' });

    const { assertUserRiskAllowed } = require('../middleware/fraudCheck.middleware');
    if (!(await assertUserRiskAllowed(user._id, reply))) return;

    const fraudService = require('../services/fraudService');
    const giftRedisVel = await fraudService.checkGiftRedisSpamVelocity(user._id);
    if (!giftRedisVel.allowed) {
      return reply.status(429).send({
        error: 'GIFT_SPAM_DETECTED',
        message: 'Gift spam detected',
      });
    }
    const giftSpike = await fraudService.checkSuspiciousNewAccountGift(user._id, cost);
    if (!giftSpike.allowed) {
      return reply.status(403).send({
        error: 'SUSPICIOUS_GIFT_SPIKE',
        message: 'Suspicious gift spike — account protection.',
      });
    }
    if (await fraudService.hasRecentChargebacks(user._id)) {
      return reply.status(403).send({
        error: 'GIFT_BLOCKED_CHARGEBACK',
        message: 'Gifts are not allowed due to payment reversal history.',
      });
    }
    if (await fraudService.hasGiftRingFlag(user._id)) {
      return reply.status(403).send({
        error: 'GIFT_RING_FLAGGED',
        message: 'Gift sending is restricted due to policy.',
      });
    }
    const ipCheck = await fraudService.checkIpReputation(request.ip);
    if (!ipCheck.allowed) {
      return reply.status(403).send({
        error: 'IP_REPUTATION_BLOCKED',
        message: 'Your connection could not be verified. Please try again later.',
      });
    }

    if (fingerprint) {
      const sameDevice = await fraudService.checkSameDeviceGift(user._id, receiverId, fingerprint);
      if (!sameDevice.allowed) {
        await fraudService.flagGiftFraud(user._id, sameDevice.reason || 'same_device', { receiverId: String(receiverId), giftId, streamId: streamIdBody ? String(streamIdBody) : null });
        return reply.status(403).send({
          error: 'GIFT_FRAUD_SAME_DEVICE',
          message: 'Gift not allowed. Same-device gifting is not permitted.',
        });
      }
    }
    const sameIp = await fraudService.checkSameIpGift(user._id, receiverId, request.ip);
    if (!sameIp.allowed) {
      await fraudService.flagGiftFraud(user._id, sameIp.reason || 'same_ip', { receiverId: String(receiverId), giftId, streamId: streamIdBody ? String(streamIdBody) : null });
      return reply.status(403).send({
        error: 'GIFT_FRAUD_SAME_IP',
        message: 'Gift not allowed. Same-IP gifting is not permitted.',
      });
    }

    const { check: checkGiftCooldown, record: recordGiftCooldown } = require('../lib/giftCooldown');
    const cooldown = checkGiftCooldown(user._id);
    if (!cooldown.allowed) {
      return reply.status(429).send({
        error: 'GIFT_COOLDOWN',
        message: 'Please wait a moment before sending another gift.',
        retryAfterMs: cooldown.retryAfterMs,
      });
    }

    if (fingerprint) {
      const multi = await fraudService.checkMultiAccount(fingerprint);
      if (!multi.allowed) {
        return reply.status(403).send({
          error: 'DEVICE_FARM_DETECTED',
          message: 'This device is associated with too many accounts.',
        });
      }
    }
    const circular = await fraudService.checkCircularGifts(user._id, receiverId);
    if (!circular.allowed) {
      await fraudService.flagGiftFraud(user._id, 'gift_ring', { receiverId: String(receiverId), count: circular.count, giftId, streamId: streamIdBody ? String(streamIdBody) : null });
      return reply.status(403).send({
        error: 'CIRCULAR_GIFT_FRAUD',
        message: 'Circular gift trading detected.',
      });
    }
    const { riskScore } = await fraudService.evaluateGiftRisk(user._id, { fingerprint, ip: request.ip });
    try {
      const { assertPaymentRiskScoreAllowed } = require('../services/paymentProtection.service');
      assertPaymentRiskScoreAllowed(riskScore, { context: 'gift_send' });
    } catch (e) {
      if (e && e.code === 'PAYMENT_RISK_BLOCKED') {
        return reply.status(403).send({ error: e.code, message: e.message || 'Transaction blocked', threshold: e.threshold });
      }
      throw e;
    }
    const velocity = await fraudService.checkGiftVelocity(user._id, { riskScore });
    if (!velocity.allowed) {
      return reply.status(429).send({
        error: 'GIFT_VELOCITY_EXCEEDED',
        message: 'Too many gifts sent. Please slow down.',
      });
    }
    const needCaptcha = captchaService.requireCaptcha(riskScore) || (await captchaService.requireCaptchaForUser(user._id));
    if (needCaptcha) {
      const captchaToken = request.body.captchaToken || request.headers['x-captcha-token'];
      if (!captchaToken) {
        return reply.status(403).send({
          error: 'CAPTCHA_REQUIRED',
          requireCaptcha: true,
          siteKey: captchaService.getSiteKey(),
          provider: captchaService.getProvider(),
        });
      }
      const verify = await captchaService.verifyToken(captchaToken, request.ip);
      if (!verify.success) {
        return reply.status(400).send({ error: 'CAPTCHA_INVALID', message: verify.error });
      }
    }
    const auditMeta = { giftId, receiverId: String(receiverId), ip: request.ip };
    if (fingerprint) auditMeta.deviceFingerprint = String(fingerprint).slice(0, 256);
    let debitResult;
    try {
      const { sendGift } = require('@millo/economy/src/gifts');
      debitResult = await sendGift(user._id, receiverId, cost, giftId, {
        ...auditMeta,
        giftId,
        streamId: streamIdBody ? String(streamIdBody) : null,
      });
    } catch (err) {
      if (err?.message === 'INSUFFICIENT_BALANCE') {
        const wallet = await db.Wallet.findOne({ userId: user._id }).lean().catch(() => null);
        return reply.status(402).send({ error: 'INSUFFICIENT_COINS', balance: wallet?.balanceCents ?? 0 });
      }
      throw err;
    }

    fraudService.logGiftSent(user._id, cost, {
      refType: 'gift',
      refId: giftId,
      ip: request.ip,
      meta: fingerprint ? { deviceFingerprint: String(fingerprint).slice(0, 256) } : {},
    }).catch(() => {});

    const kafka = require('../services/kafkaEventBus');
    kafka.publish(kafka.TOPICS.PAYMENTS, {
      event: 'gift.sent',
      userId: String(user._id),
      senderId: String(user._id),
      receiverId: String(receiverId),
      cost,
      amountCents: cost * 100,
      coins: cost,
      giftId,
      streamId: streamIdBody ? String(streamIdBody) : null,
      ip: request.ip,
      deviceFingerprint: fingerprint ? String(fingerprint).slice(0, 256) : null,
    }).catch(() => {});
    const { publishGiftSentKafka } = require('../lib/giftKafkaPublish');
    publishGiftSentKafka({
      senderId: user._id,
      receiverId,
      giftId,
      coins: cost,
      streamId: streamIdBody ? String(streamIdBody) : null,
      ip: request.ip,
      deviceFingerprint: fingerprint ? String(fingerprint).slice(0, 256) : null,
      source: 'http_gifts_send',
      fraudQueueEnqueued: true,
    }).catch(() => {});
    trackEvent({
      name: 'gift.sent',
      userId: String(user._id),
      props: {
        receiverId: String(receiverId),
        giftId,
        coins: cost,
        streamId: streamIdBody ? String(streamIdBody) : null,
      },
    }).catch(() => {});

    recordGiftCooldown(user._id);

    try {
      const { recordGiftTransaction } = require('./metrics');
      recordGiftTransaction('http_gifts_send');
    } catch (_) { /* metrics optional */ }

    const riskEngine = require('../server/services/risk.engine');
    riskEngine.setCachedUserRisk(String(user._id), Math.min(100, riskScore)).catch(() => {});

    const { getFraudCheckQueue } = require('../lib/fraudQueue');
    getFraudCheckQueue().add('gift', {
      sender_id: String(user._id),
      receiver_id: String(receiverId),
      amountCents: cost,
      giftId,
    }).catch((err) => request.log.warn({ err, giftId }, 'Failed to enqueue fraud check'));

    // Real-time notification to receiver via WS + device push
    const senderProfile = await db.Profile.findOne({ userId: user._id }).lean().catch(() => null);
    const senderName    = senderProfile?.displayName || user.email?.split('@')[0] || 'Someone';
    const { notifyUser } = require('../lib/notifyUser');
    await notifyUser(receiverId, {
      type:  'gift',
      title: 'Gift received!',
      body:  `${senderName} sent you a ${giftId} (${cost} coins)`,
      meta:  { senderId: String(user._id), giftId, coins: cost },
    }).catch((err) => request.log.warn({ err, receiverId }, 'Failed to send gift notification'));

    const { logActivity } = require('../lib/activityService');
    logActivity(user._id, 'gift_sent', receiverId).catch(() => {});

    const streamId = streamIdBody;
    if (streamId) {
      try {
        const moderationService = require('../services/moderationService');
        const senderShadowBanned = await moderationService.isShadowBanned(user._id);
        if (!senderShadowBanned) {
          const { broadcastToStream } = require('./live');
          const senderProfile = await db.Profile.findOne({ userId: user._id }).lean().catch(() => null);
          broadcastToStream(streamId, {
            type: 'gift_sent',
            gift_id: giftId,
            giftId,
            coins: cost,
            senderId: String(user._id),
            displayName: senderProfile?.displayName || user.email?.split('@')[0] || 'Viewer',
          });
        }
      } catch {}
    }

    return reply.send({ ok: true, newBalance: debitResult.balanceCents });
  });

  /* ── Stream start / stop ── */
  app.post('/content/streams/start', { config: { rateLimit: STREAM_START_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    // Creator-only gate (if creatorStatus is tracked)
    if (user.creatorStatus && user.creatorStatus !== 'approved') {
      return reply.status(403).send({ error: 'CREATOR_NOT_APPROVED', message: 'Your creator application is pending approval.' });
    }
    // Phase 14: Block suspended/banned users
    const moderationService = require('../services/moderationService');
    const modStatus = await moderationService.getUserModerationStatus(user._id);
    if (modStatus.isBanned) return reply.status(403).send({ error: 'ACCOUNT_BANNED', message: 'Your account has been suspended for violations.' });
    if (modStatus.isSuspended) return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your account is temporarily suspended.', suspendedUntil: modStatus.suspendedUntil });

    const { title, visibility = 'public', priceCents = 0, category = 'general', contentCategory = 'safe', tags = [] } = request.body ?? {};
    if (!title?.trim()) return reply.status(400).send({ error: 'title required' });
    if (title.trim().length > 120) {
      return reply.status(400).send({ error: 'TITLE_TOO_LONG', message: 'Stream title must be 120 characters or fewer' });
    }
    const price = Number(priceCents);
    if (isNaN(price) || price < 0 || price > 99900) {
      return reply.status(400).send({ error: 'INVALID_PRICE', message: 'priceCents must be between 0 and 99900' });
    }
    if (!['public', 'paid', 'followers', 'private'].includes(visibility)) {
      return reply.status(400).send({ error: 'INVALID_VISIBILITY', message: 'visibility must be public | paid | followers | private' });
    }
    if (visibility === 'paid' && price < 99) {
      return reply.status(400).send({ error: 'PPV_PRICE_TOO_LOW', message: 'Paid streams must cost at least 99 cents' });
    }
    if (!['safe', 'mature', 'explicit'].includes(contentCategory)) {
      return reply.status(400).send({ error: 'INVALID_CONTENT_CATEGORY', message: 'contentCategory must be safe | mature | explicit' });
    }

    const existing = await db.LiveStream.findOne({ userId: user._id, status: 'live' });
    if (existing) return reply.status(409).send({ error: 'ALREADY_LIVE', streamId: String(existing._id) });

    const streamKey = require('crypto').randomBytes(16).toString('hex');
    const ingestHost = process.env.RTMP_INGEST_HOST || 'ingest.milloapp.com';
    const hlsHost    = process.env.HLS_HOST          || 'hls.milloapp.com';

    const stream = await db.LiveStream.create({
      userId:         user._id,
      title:         title.trim(),
      status:        'live',
      visibility,
      priceCents:    Number(priceCents),
      category,
      contentCategory,
      tags,
      streamKey,
      playbackUrl: `https://${hlsHost}/live/${streamKey}/index.m3u8`,
      startedAt:   new Date(),
      meta:        { ingestUrl: `rtmp://${ingestHost}/live`, viewerCount: 0 },
    });
    const { logActivity } = require('../lib/activityService');
    logActivity(user._id, 'live_started', stream._id).catch(() => {});
    return reply.send({
      ok: true,
      stream: stream.toObject(),
      streamKey,
      ingestUrl:   `rtmp://${ingestHost}/live`,
      playbackUrl: stream.playbackUrl,
    });
  });

  app.post('/content/streams/:id/stop', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const stream = await db.LiveStream.findById(request.params.id);
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (stream.userId.toString() !== user._id.toString()) return reply.status(403).send({ error: 'FORBIDDEN' });
    stream.status  = 'ended';
    stream.endedAt = new Date();
    if (stream.startedAt) {
      stream.recordingDuration = Math.round((Date.now() - new Date(stream.startedAt).getTime()) / 1000);
    }
    await stream.save();
    return reply.send({ ok: true, stream: stream.toObject() });
  });

  /* ── VOD recording — set after ingest server confirms recording ── */
  app.post('/content/streams/:id/recording', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const { secret, recordingUrl, thumbnailUrl } = request.body ?? {};
    if (secret !== (process.env.INGEST_WEBHOOK_SECRET || 'millo_ingest')) {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    const stream = await db.LiveStream.findById(request.params.id);
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    stream.recordingUrl  = recordingUrl  || stream.recordingUrl;
    stream.thumbnailUrl  = thumbnailUrl  || stream.thumbnailUrl;
    await stream.save();

    const recUrl = stream.recordingUrl || recordingUrl;
    if (recUrl) {
      const moderationService = require('../services/moderationService');
      moderationService.flagForAIReview('stream', stream._id, {
        videoUrl: recUrl,
      }).catch(() => {});
      await db.LiveEvent.updateMany(
        { liveStreamId: stream._id, status: 'live' },
        { $set: { status: 'completed', replayUrl: recUrl } }
      ).catch(() => {});
      try {
        const kafkaBus = require('../services/kafkaEventBus');
        kafkaBus.publish(kafkaBus.TOPICS.VIDEO_UPLOADED, {
          event: 'video.uploaded',
          streamId: String(stream._id),
          userId: String(stream.userId),
          recordingUrl: recUrl,
          thumbnailUrl: stream.thumbnailUrl || null,
        }).catch(() => {});
        kafkaBus.publish(kafkaBus.TOPICS.VIDEO_EVENTS, {
          type: 'video.recording.available',
          streamId: String(stream._id),
          userId: String(stream.userId),
          recordingUrl: recUrl,
          thumbnailUrl: stream.thumbnailUrl || null,
        }).catch(() => {});
      } catch (_) { /* kafka optional */ }
    }
    return reply.send({ ok: true });
  });

  /* ── VOD library ── */
  app.get('/content/vod', async (request, reply) => {
    const { creatorId, limit = 20, offset = 0 } = request.query ?? {};
    const query = { status: 'ended', recordingUrl: { $ne: null }, removedAt: null };
    if (creatorId) query.userId = creatorId;
    const [vods, total] = await Promise.all([
      db.LiveStream.find(query)
      .sort({ endedAt: -1 })
      .skip(Number(offset))
      .limit(Math.min(Number(limit), 50))
        .lean(),
      db.LiveStream.countDocuments(query),
    ]);
    // Attach creator profile and sound attribution
    const userIds = [...new Set(vods.map((v) => String(v.userId)))];
    const profiles = await db.Profile.find({ userId: { $in: userIds } }).lean();
    const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const soundMap = await attachVideoSounds(vods);
    const result = vods.map((v) => ({
      ...v,
      creator: profileMap[String(v.userId)] || null,
      sound: soundMap[String(v._id)] || null,
    }));
    return reply.send({ vods: result, total });
  });

  /* ── Live auction for stream (shop the look overlay) ── */
  app.get('/content/streams/:streamId/live-auction', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const stream = await db.LiveStream.findById(request.params.streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    let auction = await db.Auction.findOne({ streamId: request.params.streamId, status: 'live' }).lean();
    if (!auction) {
      auction = await db.Auction.findOne({ creatorId: stream.userId, status: 'live' }).sort({ createdAt: -1 }).lean();
    }
    if (!auction) return reply.send({ auction: null });
    return reply.send({ auction });
  });

  /* ── Set/update sound attribution for a stream (creator only) ── */
  app.put('/content/streams/:streamId/sound', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.streamId, reply)) return;
    const streamId = request.params.streamId;
    const stream = await db.LiveStream.findById(streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (String(stream.userId) !== String(user._id)) return reply.status(403).send({ error: 'FORBIDDEN', message: 'Not your stream' });
    const { soundId, startTime = 0, duration = null } = request.body ?? {};
    if (!soundId) return reply.status(400).send({ error: 'SOUND_ID_REQUIRED', message: 'soundId is required' });
    if (!validateId(soundId, reply)) return;
    const track = await db.MusicTrack.findOne({ _id: soundId, status: 'active' }).lean();
    if (!track) return reply.status(404).send({ error: 'SOUND_NOT_FOUND', message: 'Music track not found' });
    await db.VideoSound.findOneAndUpdate(
      { videoId: streamId },
      { $set: { videoId: streamId, soundId, creatorId: stream.userId, startTime: Number(startTime), duration: duration != null ? Number(duration) : null } },
      { upsert: true, new: true }
    );
    const soundDisplay = `🎵 Sound: ${track.title || 'Unknown'}`;
    return reply.send({
      ok: true,
      videoId: streamId,
      soundId,
      creatorId: stream.userId,
      startTime: Number(startTime),
      duration: duration != null ? Number(duration) : null,
      soundDisplay,
    });
  });

  /* ── Single live stream by ID ── */
  app.get('/content/streams/:id', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const stream = await db.LiveStream.findById(request.params.id).lean().catch(() => null);
    if (!stream) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (stream.removedAt) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Content unavailable' });
    const profile = await db.Profile.findOne({ userId: stream.userId }).lean().catch(() => null);
    const soundMap = await attachVideoSounds([stream]);
    const sound = soundMap[String(stream._id)] || null;
    return reply.send({ ...stream, creator: profile || null, sound });
  });

  /* ── Single VOD (stream or event replay) ── */
  app.get('/content/vod/:id', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    return getVideo(request, reply);
  });

  /* ── Phase 12: Activity feed ── */
  app.get('/activity/feed', async (request, reply) => {
    const user = await authUser(request).catch(() => null);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const lim = Math.min(Number(request.query?.limit) || 50, 100);
    const off = Math.max(Number(request.query?.offset) || 0, 0);
    const follows = await db.Follow.find({ followerId: user._id }).select('followingId').lean();
    const actorIds = [String(user._id), ...follows.map((f) => String(f.followingId))];
    const feed = await db.Activity.find({ userId: { $in: actorIds } })
      .sort({ createdAt: -1 })
      .skip(off)
      .limit(lim)
      .lean();
    const profileIds = [...new Set(feed.map((a) => String(a.userId)))];
    const profiles = await db.Profile.find({ userId: { $in: profileIds } }).lean();
    const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const refIds = feed.map((a) => a.referenceId).filter(Boolean);
    const streams = refIds.length ? await db.LiveStream.find({ _id: { $in: refIds } }).select('title thumbnailUrl').lean() : [];
    const streamMap = Object.fromEntries(streams.map((s) => [String(s._id), s]));
    const items = feed.map((a) => ({
      ...a,
      actor: {
        userId: a.userId,
        displayName: profileMap[String(a.userId)]?.displayName || 'User',
        avatarUrl: profileMap[String(a.userId)]?.avatarUrl || null,
      },
      reference: a.referenceId ? (streamMap[String(a.referenceId)] || null) : null,
    }));
    return reply.send({ ok: true, feed: items, limit: lim, offset: off });
  });

  /* ── Video + audio composition (FFmpeg worker) ── */
  app.post('/content/compose', async (request, reply) => {
    const user = await authUser(request).catch(() => null);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { video_id: videoId, audio_id: audioId, trim_start: trimStart, trim_end: trimEnd, volume: vol } = request.body ?? {};
    if (!videoId || !audioId) return reply.status(400).send({ error: 'MISSING_INPUTS', message: 'video_id and audio_id required' });
    if (!validateId(videoId, reply) || !validateId(audioId, reply)) return;

    const stream = await db.LiveStream.findOne({ _id: videoId, userId: user._id }).lean();
    if (!stream) return reply.status(404).send({ error: 'VIDEO_NOT_FOUND', message: 'Stream not found or not yours' });
    const videoUrl = stream.recordingUrl || stream.meta?.recordingUrl;
    if (!videoUrl) return reply.status(400).send({ error: 'NO_RECORDING', message: 'Video has no recording URL yet' });

    const track = await db.MusicTrack.findOne({ _id: audioId, status: 'active' }).lean();
    if (!track) return reply.status(404).send({ error: 'AUDIO_NOT_FOUND', message: 'Music track not found' });
    const audioUrl = track.audioUrl || track.streamUrl;
    if (!audioUrl) return reply.status(400).send({ error: 'NO_AUDIO_URL', message: 'Track has no audio URL' });

    const trim_start = trimStart != null ? Number(trimStart) : 0;
    const trim_end = trimEnd != null ? Number(trimEnd) : null;
    const volume = vol != null ? Math.max(0, Math.min(2, Number(vol))) : 1;

    const job = await db.CompositionJob.create({
      userId: user._id,
      videoId: stream._id,
      audioId: track._id,
      trimStart: trim_start,
      trimEnd: trim_end,
      volume,
      status: 'pending',
      videoUrl,
      audioUrl,
    });
    const { getCompositionQueue } = require('../lib/compositionQueue');
    await getCompositionQueue().add('compose', {
      jobId: String(job._id),
      videoUrl,
      audioUrl,
      trimStart: trim_start,
      trimEnd: trim_end,
      volume,
    }, { jobId: String(job._id) });
    return reply.send({
      ok: true,
      job_id: String(job._id),
      status: 'pending',
      message: 'Composition job queued. Poll GET /content/compose/:job_id for status.',
    });
  });

  app.get('/content/compose/:jobId', async (request, reply) => {
    const user = await authUser(request).catch(() => null);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.jobId, reply)) return;
    const job = await db.CompositionJob.findOne({ _id: request.params.jobId, userId: user._id }).lean();
    if (!job) return reply.status(404).send({ error: 'JOB_NOT_FOUND' });
    return reply.send({
      job_id: String(job._id),
      status: job.status,
      output_url: job.outputUrl || null,
      error: job.error || null,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    });
  });

  /* ── Serve composed file (when API has access to COMPOSED_MEDIA_DIR, e.g. shared volume) ── */
  app.get('/content/compose/:jobId/file', async (request, reply) => {
    const user = await authUser(request).catch(() => null);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.jobId, reply)) return;
    const job = await db.CompositionJob.findOne({ _id: request.params.jobId, userId: user._id }).lean();
    if (!job || job.status !== 'completed' || !job.outputUrl) return reply.status(404).send({ error: 'FILE_NOT_READY' });
    const composedDir = process.env.COMPOSED_MEDIA_DIR || '';
    if (!composedDir) return reply.status(503).send({ error: 'COMPOSED_MEDIA_NOT_CONFIGURED' });
    const path = require('path');
    const fs = require('fs');
    const filePath = path.join(composedDir, `${job._id}.mp4`);
    if (!fs.existsSync(filePath)) return reply.status(404).send({ error: 'FILE_NOT_FOUND' });
    reply.header('Content-Type', 'video/mp4');
    reply.header('Content-Disposition', `inline; filename="composed-${job._id}.mp4"`);
    return reply.send(fs.createReadStream(filePath));
  });
}

module.exports = { contentRoutes };
