'use strict';
/**
 * For You feed — discovery pipeline + optional Kafka `rank.predictions` log.
 * GET /api/feed?limit=20&cursor= — Contract: { items, cursor, nextCursor, hasMore, feedPaginationContractVersion }.
 *   Cursor query accepts the same base64url offset token as `cursor`, `nextCursor`, or `before` (aliases).
 *   Items are fully hydrated (`video.user`, `video.stats`); partial rows are dropped; trending backfills; placeholders only if trending is empty.
 *   If `buildForYouFeed` throws, the handler falls back to offset-aware trending (not HTTP 500) so clients still get a valid, scrollable feed.
 *   First page (offset 0): Redis `feed:${userId}` JSON + EX 60 when Redis is available (internal `__l` matches request limit).
 * GET /feed/for-you?limit=20&cursor= — Explore-style discovery feed (heavy ranking, profile + candidates); same pipeline as GET /feed/explore.
 * GET /feed/explore?limit=20&cursor= — Alias with feedKind: explore, rankingMode: discovery_heuristic (AI features remain shadow-mode per product config).
 * GET /feed/following?limit=20&cursor= — Followed creators only; reverse-chronological + light tie-breaks (live, viewers); FEED_FOLLOWING_ENABLED=false → 503.
 * GET /feed/realtime?limit=20 — optional simple ranker (`ranking.service.rankFeed`) over live streams; FEED_REALTIME_SIMPLE_ENABLED=true.
 * Optional A/B on likes weight: RANKING_AB_TEST_ENABLED=true (`abtest.getVariant`); items include `abVariant` when enabled.
 * When FEED_REALTIME_CONTENT_CANDIDATES=true, merges `candidateGeneration.service.getCandidateVideos` (following, trending, new, similar) with live candidates.
 * POST /feed/events/* — persist FeedEvent + emit feed.* (reference pack parity).
 * Env: FEED_FOR_YOU_ENABLED=false disables GET (503); FEED_EVENTS_ENABLED=false disables POST events (503).
 * Feed KPIs (watch time, completion, CTR components): Prometheus via `recordFeedKpiFromFeedEvent` in `routes/metrics.js`; aggregates `GET /analytics/feed-kpis`.
 * Real-time personalization cache: `feedPersonalizationCache.service.js` — FEED_REDIS_CACHE_ENABLED=true, JSON under `feed:${userId}:…` (scoped; see service). Cache hit skips rebuild and Kafka rank.predictions for that response.
 * In-feed ads: FEED_IN_FEED_ADS_ENABLED=true — `ad.service.js` inserts an ad slot every FEED_IN_FEED_ADS_INTERVAL (default 5) after cache read / before response; organic slate in cache stays ad-free.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { resolveSession } = require('./auth');
const { redis } = require('../lib/redis');

const API_FEED_CONTRACT_CACHE_TTL_SEC = 60;

/**
 * PATCH 10 — Redis feed cache key (`feed:${userId}`). userId is a Mongo ObjectId string (hex).
 * @param {string} userId
 */
function apiFeedContractRedisKey(userId) {
  return `feed:${String(userId)}`;
}

/**
 * PATCH 10 — `redis.get` + JSON.parse; first page only; `__l` must match requested limit.
 * @param {string} userId
 * @param {number} limit
 * @param {number} offset
 * @returns {Promise<{ items: unknown[], nextCursor: string|null, hasMore: boolean }|null>}
 */
async function getApiFeedContractFromRedis(userId, limit, offset) {
  if (offset !== 0) return null;
  try {
    const cacheKey = apiFeedContractRedisKey(userId);
    const cached = await redis.get(cacheKey);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return null;
    if (Number(parsed.__l) !== limit) return null;
    return {
      items: parsed.items,
      nextCursor: parsed.nextCursor != null ? String(parsed.nextCursor) : null,
      hasMore: Boolean(parsed.hasMore),
    };
  } catch {
    return null;
  }
}

/**
 * PATCH 10 — `redis.set` … `EX`, 60 after `generateFeed` equivalent (`buildDiscoveryFeedFullBody`).
 * @param {string} userId
 * @param {number} limit
 * @param {number} offset
 * @param {{ items: unknown[], nextCursor: string|null, hasMore: boolean }} contract
 */
async function setApiFeedContractInRedis(userId, limit, offset, contract) {
  if (offset !== 0) return;
  try {
    const cacheKey = apiFeedContractRedisKey(userId);
    const payload = {
      items: contract.items,
      nextCursor: contract.nextCursor,
      hasMore: contract.hasMore,
      __l: limit,
    };
    await redis.set(cacheKey, JSON.stringify(payload), 'EX', API_FEED_CONTRACT_CACHE_TTL_SEC);
  } catch {
    /* non-fatal */
  }
}

const WATCH_EVENT_TYPES = new Set(['play', 'watch_2s', 'watch_6s', 'watch_15s', 'complete']);
const ENGAGEMENT_EVENT_TYPES = new Set(['like', 'comment', 'share', 'follow_creator', 'gift', 'purchase']);
const NEGATIVE_EVENT_TYPES = new Set(['skip_fast', 'not_interested', 'report']);

/**
 * Decode `cursor` query (base64url JSON `{ "o": offset }`) for For You pagination.
 * @param {unknown} raw
 * @param {number} maxOffset
 * @returns {number}
 */
function parseForYouCursor(raw, maxOffset) {
  const cap = Number.isFinite(maxOffset) && maxOffset > 0 ? Math.floor(maxOffset) : 200;
  if (raw == null || raw === '') return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  try {
    const json = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    const o = Math.floor(Number(json.o));
    if (!Number.isFinite(o) || o < 0) return 0;
    return Math.min(cap, o);
  } catch {
    return 0;
  }
}

/** Stable keys for feed rows (contentId, videoUrl, creatorName) — server-side honesty for clients. */
const FEED_ITEM_CONTRACT_VERSION = 1;
/** Offset-cursor feed pages (for-you / explore / following / api/feed) — bump when pagination rules change. */
const FEED_PAGINATION_CONTRACT_VERSION = 1;

/**
 * @param {Record<string, unknown>|undefined} query
 * @param {number} maxOffset
 */
function parseForYouCursorFromQuery(query, maxOffset) {
  const raw = query?.cursor ?? query?.nextCursor ?? query?.before;
  return parseForYouCursor(raw, maxOffset);
}

function hydrateFeedItemForClient(it) {
  if (!it || typeof it !== 'object') return it;
  const contentIdRaw = it.contentId ?? it.id ?? it._id;
  const contentId = contentIdRaw != null && contentIdRaw !== '' ? String(contentIdRaw) : '';
  const creatorId = it.creatorId != null ? String(it.creatorId) : null;
  let creatorName = '';
  if (typeof it.creatorName === 'string' && it.creatorName.trim()) creatorName = it.creatorName.trim();
  else if (typeof it.creator === 'string' && it.creator.trim()) creatorName = it.creator.trim();
  else if (it.creator && typeof it.creator === 'object') {
    creatorName = String(it.creator.displayName || it.creator.username || it.creator.name || '').trim();
  }
  const videoUrl = it.videoUrl ?? it.streamUrl ?? it.recordingUrl ?? null;
  const thumbnailUrl = it.thumbnailUrl ?? it.thumbnail ?? null;
  const out = {
    ...it,
    contentId: contentId || it.contentId,
    creatorId,
    videoUrl,
    thumbnailUrl,
    feedItemContractVersion: FEED_ITEM_CONTRACT_VERSION,
  };
  if (creatorName) out.creatorName = creatorName;
  return out;
}

function mapFeedItemsForResponse(items) {
  if (!Array.isArray(items)) return [];
  return items.map(hydrateFeedItemForClient);
}

async function authUser(request) {
  const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  return resolveSession(token);
}

/** Load session events from body (POST) or x-session-events header (JSON). */
function loadRecentSessionEvents(request) {
  const raw = request.body?.recentEvents ?? request.headers['x-session-events'];
  if (Array.isArray(request.body?.recentEvents)) return request.body.recentEvents;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getBlockedCreatorIds(userId) {
  const rows = await db.Block.find({ blockerId: userId }).select('blockedUserId').lean();
  return (rows || []).map((r) => String(r.blockedUserId));
}

/** Compliance fragment for trending fallback (Phase 9 content filter). */
async function resolveFeedComplianceContext(request, userId) {
  const region = request.region || {};
  let contentFilter = {};
  try {
    const compliance = require('@millo/compliance');
    const regionCode = region.user_compliance_zone || region.user_country || 'US';
    const access = await compliance.canAccessContent(userId, 'explicit', regionCode);
    contentFilter = compliance.contentFilterForUser(access.allowed);
  } catch {
    /* non-fatal */
  }
  return { region, contentFilter };
}

/** Canonical cursor alias for clients (`cursor` === `nextCursor`). */
function sealFeedCursorFields(body) {
  if (!body || typeof body !== 'object') return body;
  const next = body.nextCursor != null ? String(body.nextCursor) : null;
  return {
    ...body,
    nextCursor: next,
    cursor: next,
    feedPaginationContractVersion: FEED_PAGINATION_CONTRACT_VERSION,
  };
}

/** @param {string} userId */
async function buildUserForSimpleRank(userId) {
  const feats = await db.UserProfileFeatures.findOne({ userId: String(userId) }).lean().catch(() => null);
  const profile = Object.create(null);
  if (feats?.categoryAffinityTop?.length) {
    for (const c of feats.categoryAffinityTop) {
      const k = String(c).toLowerCase().trim();
      if (k) profile[k] = (profile[k] || 0) + 10;
    }
  }
  return { _id: userId, profile };
}

/**
 * Live public streams as ranking candidates (simple realtime path).
 * @param {number} max
 */
async function getCandidateLiveVideos(max) {
  const rows = await db.LiveStream.find({
    status: 'live',
    visibility: 'public',
    removedAt: null,
  })
    .sort({ viewerCount: -1, createdAt: -1 })
    .limit(max)
    .lean();
  return rows.map((s) => ({
    id: String(s._id),
    _id: s._id,
    userId: s.userId,
    category: s.category || 'general',
    createdAt: s.createdAt,
    title: s.title,
    thumbnailUrl: s.thumbnailUrl,
    playbackUrl: s.playbackUrl,
    viewerCount: s.viewerCount,
  }));
}

/**
 * @param {unknown} meta
 * @returns {Record<string, string|number|boolean>}
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out = {};
  let n = 0;
  for (const k of Object.keys(meta)) {
    if (n >= 32) break;
    const key = String(k).slice(0, 64);
    const v = meta[k];
    if (typeof v === 'string') out[key] = v.slice(0, 512);
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v;
    n += 1;
  }
  return out;
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {string} userId
 * @param {object} body
 * @param {string} eventType
 * @returns {object}
 */
function buildFeedEventDoc(userId, body, eventType) {
  const b = body && typeof body === 'object' ? body : {};
  const contentId = b.contentId != null ? String(b.contentId).trim() : '';
  return {
    userId,
    contentId,
    sessionId: b.sessionId != null ? String(b.sessionId).slice(0, 128) : null,
    eventType,
    watchTimeMs: Number.isFinite(Number(b.watchTimeMs)) ? Number(b.watchTimeMs) : 0,
    position: Number.isFinite(Number(b.position)) ? Number(b.position) : 0,
    source: b.source != null ? String(b.source).slice(0, 64) : 'for_you',
    topic: b.topic != null ? String(b.topic).slice(0, 256) : null,
    contentType: b.contentType != null ? String(b.contentType).slice(0, 64) : null,
    meta: sanitizeMeta(b.meta),
    ts: b.ts ? new Date(b.ts) : new Date(),
  };
}

/**
 * @param {import('fastify').FastifyRequest} request
 * @param {import('fastify').FastifyReply} reply
 * @param {{ kafkaTopic: string, forcedEventType?: string, allowedTypes: Set<string> }} opts
 */
async function postFeedEvent(request, reply, opts) {
  if (process.env.FEED_EVENTS_ENABLED === 'false') {
    return reply.status(503).send({ error: 'FEED_EVENTS_DISABLED' });
  }

  const user = await authUser(request);
  if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

  const userId = String(user._id);
  const body = request.body && typeof request.body === 'object' ? request.body : {};

  const eventType = opts.forcedEventType
    ? opts.forcedEventType
    : body.eventType != null
      ? String(body.eventType).trim()
      : '';

  if (!eventType || !opts.allowedTypes.has(eventType)) {
    return reply.status(400).send({ error: 'INVALID_EVENT_TYPE' });
  }

  const doc = buildFeedEventDoc(userId, body, eventType);
  if (!doc.contentId) {
    return reply.status(400).send({ error: 'CONTENT_ID_REQUIRED' });
  }

  let created;
  try {
    created = await db.FeedEvent.create(doc);
  } catch (err) {
    request.log.error({ err }, 'feed event: create failed');
    return reply.status(400).send({ error: 'FEED_EVENT_INVALID' });
  }

  try {
    const { recordFeedKpiFromFeedEvent } = require('./metrics');
    recordFeedKpiFromFeedEvent(doc);
  } catch {
    /* KPI recording must not affect feed events */
  }

  const payload = {
    userId: doc.userId,
    contentId: doc.contentId,
    sessionId: doc.sessionId,
    eventType: doc.eventType,
    watchTimeMs: doc.watchTimeMs,
    position: doc.position,
    source: doc.source,
    topic: doc.topic,
    contentType: doc.contentType,
    meta: doc.meta,
    ts: doc.ts.toISOString(),
    id: String(created._id),
  };

  try {
    const kafkaBus = require('../services/kafkaEventBus');
    const { emitFeedEvent } = require('../services/feedEvents.producer');
    await emitFeedEvent(opts.kafkaTopic, payload);
  } catch (err) {
    request.log.warn({ err }, 'feed event: kafka emit failed');
  }

  return reply.status(201).send({ ok: true, id: String(created._id) });
}

/**
 * Mutates `body.items` when FEED_IN_FEED_ADS_ENABLED=true (does not run when ADS_ENABLED=false).
 * @param {import('fastify').FastifyRequest} request
 * @param {string} userId
 * @param {{ items?: object[] }} body
 */
async function injectInFeedAdsIfEnabled(request, userId, body) {
  if (process.env.FEED_IN_FEED_ADS_ENABLED !== 'true') return;
  if (process.env.ADS_ENABLED === 'false') return;
  const list = body?.items;
  if (!Array.isArray(list) || list.length === 0) return;
  try {
    const adService = require('../services/ad.service');
    const region = request.region?.user_country || request.region?.user_compliance_zone;
    const candidates = await adService.queryActiveAds({
      placement: 'feed',
      adSurface: 'in_feed',
      region: region || null,
      limit: 15,
    });
    const pick = adService.selectAd({ userId }, candidates);
    if (!pick) return;
    const interval = Math.min(20, Math.max(3, Number(process.env.FEED_IN_FEED_ADS_INTERVAL) || 5));
    body.items = adService.injectInFeedAdSlots(list, pick, { interval });
  } catch (err) {
    request.log.warn({ err }, 'feed: in-feed ad injection failed');
  }
}

/**
 * Shared discovery-heavy feed page (For You / Explore) — body before in-feed ads.
 * @param {{ feedKind?: string, rankingMode?: string, logLabel?: string }} meta
 * @returns {Promise<
 *   | { ok: false, status: number, payload: object }
 *   | { ok: true, userId: string, body: object }
 * >}
 */
async function buildDiscoveryFeedFullBody(request, meta = {}) {
  const {
    feedKind = 'for_you',
    rankingMode = 'discovery_heuristic',
    logLabel = 'feed/for-you',
  } = meta;

  if (process.env.FEED_FOR_YOU_ENABLED === 'false') {
    return { ok: false, status: 503, payload: { error: 'FEED_FOR_YOU_DISABLED' } };
  }

  const user = await authUser(request);
  if (!user) return { ok: false, status: 401, payload: { error: 'UNAUTHORIZED' } };

  const limit = Math.min(100, Math.max(1, Number(request.query?.limit) || 20));
  const userId = String(user._id);

  let blockedCreatorIds = [];
  try {
    blockedCreatorIds = await getBlockedCreatorIds(userId);
  } catch (err) {
    request.log.warn({ err }, `${logLabel}: block list load failed`);
  }

  const { feedService } = require('@millo/discovery');
  const maxOff = feedService.FOR_YOU_MAX_WINDOW ?? 200;
  const offset = parseForYouCursorFromQuery(request.query, maxOff);
  const { observeFeedPipeline } = require('./metrics');
  const { getFeedRankExperimentContext } = require('../services/experiments');
  const rankExp = getFeedRankExperimentContext(userId);
  const sessionEvents = loadRecentSessionEvents(request);
  const personalizedCache = require('../services/feedPersonalizationCache.service');
  const discoveryScope = personalizedCache.buildDiscoveryScope({
    feedKind,
    limit,
    offset,
    sessionEvents,
    experimentBucket: rankExp.experimentBucket,
    blockedCreatorIds,
  });
  const cachedDiscovery = await personalizedCache.getCachedFeedPayload(userId, discoveryScope);
  if (cachedDiscovery) {
    personalizedCache.recordFeedCacheHit();
    let cachedItems = mapFeedItemsForResponse(cachedDiscovery.items || []);
    const { region, contentFilter } = await resolveFeedComplianceContext(request, userId);
    const feedItemHydration = require('../services/feedItemHydration.service');
    const fin = await feedItemHydration.finalizeFeedOrganicItems(cachedItems, {
      limit,
      blockedCreatorIds,
      hasMore: Boolean(cachedDiscovery.hasMore),
      contentFilter,
      region,
      feedPageOffset: offset,
    });
    return {
      ok: true,
      userId,
      body: sealFeedCursorFields({
        ...cachedDiscovery,
        items: fin.items,
        hasMore: fin.hasMore,
        feedItemContractVersion: FEED_ITEM_CONTRACT_VERSION,
        feedCursorEncoding: cachedDiscovery.feedCursorEncoding || 'offset_v1',
      }),
    };
  }
  personalizedCache.recordFeedCacheMiss();

  let feedResult;
  let rankingFallback = false;
  try {
    feedResult = await feedService.buildForYouFeed({
      userId,
      context: {
        blockedCreatorIds,
        hiddenContentIds: [],
        recentEvents: sessionEvents,
        experimentBucket: rankExp.experimentBucket,
        rankWeightOverrides: rankExp.rankWeightOverrides,
      },
      limit,
      offset,
      observe: observeFeedPipeline,
    });
  } catch (err) {
    request.log.error({ err }, `${logLabel}: buildForYouFeed failed — trending fallback`);
    rankingFallback = true;
    feedResult = { items: [], hasMore: false, nextCursor: null };
  }

  let items = mapFeedItemsForResponse(feedResult?.items ?? []);
  let nextCursor = feedResult?.nextCursor ?? null;
  const rankedHasMore = Boolean(feedResult?.hasMore);

  const { region, contentFilter } = await resolveFeedComplianceContext(request, userId);
  const feedItemHydration = require('../services/feedItemHydration.service');
  const fin = await feedItemHydration.finalizeFeedOrganicItems(items, {
    limit,
    blockedCreatorIds,
    hasMore: rankedHasMore,
    contentFilter,
    region,
    feedPageOffset: offset,
    allowTrendingWhenEmpty: true,
  });
  items = fin.items;
  let hasMore = fin.hasMore;

  if (rankingFallback) {
    const nextOff = offset + items.length;
    hasMore = Boolean(fin.hasMore && nextOff < maxOff && items.length > 0);
    nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ o: nextOff, v: 1 }), 'utf8').toString('base64url')
      : null;
  } else {
    nextCursor = feedResult?.nextCursor ?? null;
  }

  try {
    const kafkaBus = require('../services/kafkaEventBus');
    const { emitFeedEvent } = require('../services/feedEvents.producer');
    await emitFeedEvent(kafkaBus.TOPICS.RANK_PREDICTIONS, {
      userId,
      ts: new Date().toISOString(),
      experimentBucket: rankExp.experimentBucket,
      feedKind,
      rankingMode,
      items,
      feedOffset: offset,
      hasMore,
    });
  } catch (err) {
    request.log.warn({ err }, `${logLabel}: rank.predictions emit failed`);
  }

  const body = sealFeedCursorFields({
    items,
    nextCursor,
    hasMore,
    pagingMode: 'offset_capped',
    pagingMaxWindow: maxOff,
    feedCursorEncoding: 'offset_v1',
    feedItemContractVersion: FEED_ITEM_CONTRACT_VERSION,
  });
  if (feedKind !== 'for_you') {
    body.feedKind = feedKind;
    body.rankingMode = rankingMode;
  }
  await personalizedCache.setCachedFeedPayload(userId, discoveryScope, body);
  return { ok: true, userId, body };
}

/**
 * @param {{ feedKind?: string, rankingMode?: string, logLabel?: string }} meta
 */
async function serveDiscoveryFeedPage(request, reply, meta = {}) {
  const built = await buildDiscoveryFeedFullBody(request, meta);
  if (!built.ok) return reply.status(built.status).send(built.payload);
  await injectInFeedAdsIfEnabled(request, built.userId, built.body);
  return reply.send(sealFeedCursorFields(built.body));
}

async function feedRoutes(app) {
  /** Stable JSON contract + Redis `feed:${userId}` EX 60 on first page (limit must match cache). */
  app.get('/api/feed', async (request, reply) => {
    if (process.env.FEED_FOR_YOU_ENABLED === 'false') {
      return reply.status(503).send({ error: 'FEED_FOR_YOU_DISABLED' });
    }
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const limit = Math.min(100, Math.max(1, Number(request.query?.limit) || 20));
    const userId = String(user._id);
    const { feedService } = require('@millo/discovery');
    const maxOff = feedService.FOR_YOU_MAX_WINDOW ?? 200;
    const offset = parseForYouCursorFromQuery(request.query, maxOff);

    const fromContractRedis = await getApiFeedContractFromRedis(userId, limit, offset);
    if (fromContractRedis) {
      let blockedCreatorIds = [];
      try {
        blockedCreatorIds = await getBlockedCreatorIds(userId);
      } catch (err) {
        request.log.warn({ err }, 'api/feed redis: block list load failed');
      }
      const { region, contentFilter } = await resolveFeedComplianceContext(request, userId);
      const feedItemHydration = require('../services/feedItemHydration.service');
      const fin = await feedItemHydration.finalizeFeedOrganicItems(
        mapFeedItemsForResponse(fromContractRedis.items || []),
        {
          limit,
          blockedCreatorIds,
          hasMore: Boolean(fromContractRedis.hasMore),
          contentFilter,
          region,
          feedPageOffset: offset,
        }
      );
      return reply.send(
        sealFeedCursorFields({
          items: fin.items,
          nextCursor: fromContractRedis.nextCursor != null ? String(fromContractRedis.nextCursor) : null,
          hasMore: fin.hasMore,
          feedItemContractVersion: FEED_ITEM_CONTRACT_VERSION,
          feedCursorEncoding: fromContractRedis.feedCursorEncoding || 'offset_v1',
        })
      );
    }

    const built = await buildDiscoveryFeedFullBody(request, {
      feedKind: 'for_you',
      rankingMode: 'discovery_heuristic',
      logLabel: 'api/feed',
    });
    if (!built.ok) return reply.status(built.status).send(built.payload);

    const b = built.body;
    const contract = sealFeedCursorFields({
      items: Array.isArray(b.items) ? b.items : [],
      nextCursor: b.nextCursor != null ? String(b.nextCursor) : null,
      hasMore: Boolean(b.hasMore),
      feedItemContractVersion: FEED_ITEM_CONTRACT_VERSION,
      feedCursorEncoding: b.feedCursorEncoding || 'offset_v1',
    });
    await setApiFeedContractInRedis(userId, limit, offset, {
      items: contract.items,
      nextCursor: contract.nextCursor,
      hasMore: contract.hasMore,
      feedCursorEncoding: contract.feedCursorEncoding,
    });
    return reply.send(contract);
  });

  app.get('/feed/for-you', async (request, reply) => {
    return serveDiscoveryFeedPage(request, reply, {
      feedKind: 'for_you',
      rankingMode: 'discovery_heuristic',
      logLabel: 'feed/for-you',
    });
  });

  app.get('/feed/explore', async (request, reply) => {
    return serveDiscoveryFeedPage(request, reply, {
      feedKind: 'explore',
      rankingMode: 'discovery_heuristic',
      logLabel: 'feed/explore',
    });
  });

  app.get('/feed/following', async (request, reply) => {
    if (process.env.FEED_FOLLOWING_ENABLED === 'false') {
      return reply.status(503).send({ error: 'FEED_FOLLOWING_DISABLED' });
    }

    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const limit = Math.min(100, Math.max(1, Number(request.query?.limit) || 20));
    const userId = String(user._id);

    let blockedCreatorIds = [];
    try {
      blockedCreatorIds = await getBlockedCreatorIds(userId);
    } catch (err) {
      request.log.warn({ err }, 'feed/following: block list load failed');
    }

    const { feedService } = require('@millo/discovery');
    const maxOff = feedService.FOLLOWING_MAX_WINDOW ?? 500;
    const offset = parseForYouCursorFromQuery(request.query, maxOff);
    const { observeFeedPipeline } = require('./metrics');
    const personalizedCache = require('../services/feedPersonalizationCache.service');
    const followingScope = personalizedCache.buildFollowingScope({
      limit,
      offset,
      blockedCreatorIds,
    });
    const cachedFollowing = await personalizedCache.getCachedFeedPayload(userId, followingScope);
    if (cachedFollowing) {
      personalizedCache.recordFeedCacheHit();
      return reply.send(sealFeedCursorFields(cachedFollowing));
    }
    personalizedCache.recordFeedCacheMiss();

    let feedResult;
    let followingRankingFallback = false;
    try {
      feedResult = await feedService.buildFollowingFeedLight({
        userId,
        context: { blockedCreatorIds, hiddenContentIds: [] },
        limit,
        offset,
        observe: observeFeedPipeline,
      });
    } catch (err) {
      request.log.error({ err }, 'feed/following: buildFollowingFeedLight failed — empty slate');
      followingRankingFallback = true;
      feedResult = { items: [], hasMore: false, nextCursor: null };
    }

    const rawItems = feedResult?.items ?? [];
    let nextCursor = feedResult?.nextCursor ?? null;
    const rankedHasMore = Boolean(feedResult?.hasMore);

    const { region, contentFilter } = await resolveFeedComplianceContext(request, userId);
    const feedItemHydration = require('../services/feedItemHydration.service');
    const finFollowing = await feedItemHydration.finalizeFeedOrganicItems(mapFeedItemsForResponse(rawItems), {
      limit,
      blockedCreatorIds,
      hasMore: rankedHasMore,
      contentFilter,
      region,
      feedPageOffset: offset,
      allowTrendingWhenEmpty: false,
    });
    let items = finFollowing.items;
    let hasMore = finFollowing.hasMore;
    if (followingRankingFallback) {
      nextCursor = null;
      hasMore = false;
    }

    const followingBody = {
      items,
      nextCursor,
      hasMore,
      feedKind: 'following',
      rankingMode: 'chronological_light',
      pagingMode: 'offset_capped',
      pagingMaxWindow: maxOff,
      feedItemContractVersion: FEED_ITEM_CONTRACT_VERSION,
      feedCursorEncoding: 'offset_v1',
    };
    await personalizedCache.setCachedFeedPayload(userId, followingScope, followingBody);
    return reply.send(sealFeedCursorFields(followingBody));
  });

  app.get('/feed/realtime', async (request, reply) => {
    if (process.env.FEED_REALTIME_SIMPLE_ENABLED !== 'true') {
      return reply.status(503).send({ error: 'FEED_REALTIME_SIMPLE_DISABLED' });
    }

    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const limit = Math.min(100, Math.max(1, Number(request.query?.limit) || 20));
    const candidateCap = Math.min(200, Math.max(limit * 4, limit));

    const userId = String(user._id);
    let blockedCreatorIds = [];
    try {
      blockedCreatorIds = await getBlockedCreatorIds(userId);
    } catch (err) {
      request.log.warn({ err }, 'feed/realtime: block list load failed');
    }
    const blockedSet = new Set(blockedCreatorIds);

    const { rankFeed } = require('../services/ranking.service');
    const userForRank = await buildUserForSimpleRank(userId);
    let videos = await getCandidateLiveVideos(candidateCap);
    if (process.env.FEED_REALTIME_CONTENT_CANDIDATES === 'true') {
      const { getCandidateVideos } = require('../services/candidateGeneration.service');
      const content = await getCandidateVideos(userId, {
        following: Math.min(80, candidateCap),
        trending: Math.min(80, candidateCap),
        recent: Math.min(80, candidateCap),
        similar: Math.min(120, candidateCap),
      });
      const seen = new Set(videos.map((v) => String(v.id)));
      const extra = [];
      for (const c of content) {
        const id = String(c.id);
        if (seen.has(id)) continue;
        seen.add(id);
        extra.push(c);
      }
      videos = [...videos, ...extra].slice(0, candidateCap);
    }
    videos = videos.filter((v) => {
      const creator = v.userId != null ? String(v.userId) : String(v.creatorId ?? '');
      return creator && !blockedSet.has(creator);
    });

    const contentCandidatesOn = process.env.FEED_REALTIME_CONTENT_CANDIDATES === 'true';
    const personalizedCache = require('../services/feedPersonalizationCache.service');
    const realtimeScope = personalizedCache.buildRealtimeScope({
      limit,
      contentCandidates: contentCandidatesOn,
      blockedCreatorIds,
    });
    const cachedRt = await personalizedCache.getCachedFeedPayload(userId, realtimeScope);
    if (cachedRt) {
      personalizedCache.recordFeedCacheHit();
      return reply.send(sealFeedCursorFields(cachedRt));
    }
    personalizedCache.recordFeedCacheMiss();

    const signalsMap = {};
    let ranked;
    try {
      ranked = rankFeed(userForRank, videos, signalsMap);
    } catch (err) {
      request.log.warn({ err }, 'feed/realtime: rankFeed failed — viewerCount fallback');
      ranked = [...videos].sort((a, b) => (Number(b.viewerCount) || 0) - (Number(a.viewerCount) || 0));
    }
    const pageItems = ranked.slice(0, limit);
    const hasMore = ranked.length > limit;
    const last = pageItems[pageItems.length - 1];
    const lastId = last && (last.id != null ? last.id : last._id);
    const realtimeBody = {
      items: pageItems,
      nextCursor: hasMore && lastId != null ? String(lastId) : null,
      hasMore,
      mode: 'realtime_simple',
    };
    await personalizedCache.setCachedFeedPayload(userId, realtimeScope, realtimeBody);
    return reply.send(sealFeedCursorFields(realtimeBody));
  });

  app.post('/feed/events/impression', async (request, reply) => {
    return postFeedEvent(request, reply, {
      kafkaTopic: require('../services/kafkaEventBus').TOPICS.FEED_IMPRESSION,
      forcedEventType: 'impression',
      allowedTypes: new Set(['impression']),
    });
  });

  app.post('/feed/events/watch', async (request, reply) => {
    return postFeedEvent(request, reply, {
      kafkaTopic: require('../services/kafkaEventBus').TOPICS.FEED_WATCH,
      allowedTypes: WATCH_EVENT_TYPES,
    });
  });

  app.post('/feed/events/engagement', async (request, reply) => {
    return postFeedEvent(request, reply, {
      kafkaTopic: require('../services/kafkaEventBus').TOPICS.FEED_ENGAGEMENT,
      allowedTypes: ENGAGEMENT_EVENT_TYPES,
    });
  });

  app.post('/feed/events/negative', async (request, reply) => {
    return postFeedEvent(request, reply, {
      kafkaTopic: require('../services/kafkaEventBus').TOPICS.FEED_NEGATIVE,
      allowedTypes: NEGATIVE_EVENT_TYPES,
    });
  });
}

module.exports = { feedRoutes };
