'use strict';
/**
 * Feed hydration — full `video.user` + `video.stats`; drop partials; pad with trending.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { discoveryService } = require('@millo/discovery');

function isLikelyObjectId(s) {
  return typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);
}

/**
 * @param {object} it
 * @returns {boolean}
 */
function isCompleteFeedItem(it) {
  if (!it || typeof it !== 'object') return false;
  if (it.type === 'ad' && it.ad && typeof it.ad === 'object') return true;
  const v = it.video;
  if (!v || typeof v !== 'object') return false;
  const u = v.user;
  if (!u || typeof u !== 'object') return false;
  const idOk = String(u.id || u.userId || '').trim();
  const nameOk = String(u.displayName || u.username || '').trim();
  if (!idOk && !nameOk) return false;
  const s = v.stats;
  if (!s || typeof s !== 'object') return false;
  return true;
}

/**
 * @param {object} row — discovery `fetchStreamItems` style
 * @param {number} rank
 * @returns {object}
 */
function trendingRowToFeedItem(row, rank) {
  const stream = row.stream || {};
  const cid = String(row.id != null ? row.id : '');
  const creatorIdStr = row.creatorId != null ? String(row.creatorId) : '';
  const displayName =
    typeof row.creator === 'string' && row.creator.trim()
      ? row.creator.trim()
      : String(row.creator?.displayName || '').trim() || 'Creator';
  const user = {
    id: creatorIdStr,
    displayName,
    username: row.creator && typeof row.creator === 'object' ? row.creator.username : null,
    avatarUrl: row.avatarUrl || null,
  };
  const stats = {
    likes: Number(row.likes) || 0,
    comments: Number(row.comments) || 0,
    shares: Number(row.shares) || 0,
    viewers: Number(row.viewers) || 0,
    watchTimeSeconds: Number(row.watchTimeSeconds) || 0,
  };
  const playbackUrl = stream.playbackUrl || stream.recordingUrl || row.recordingUrl || null;
  const video = {
    id: cid,
    title: row.title || stream.title || 'Stream',
    thumbnailUrl: row.thumbnailUrl || stream.thumbnailUrl || stream.meta?.thumbnailUrl || null,
    playbackUrl,
    status: stream.status,
    user,
    stats,
  };
  return {
    rank,
    score: Number(row.baseScore) || 0,
    contentId: cid,
    creatorId: creatorIdStr || null,
    type: row.type === 'live' || stream.status === 'live' ? 'live' : 'short',
    video,
    videoUrl: playbackUrl,
    thumbnailUrl: video.thumbnailUrl,
    creatorName: displayName,
  };
}

/**
 * @param {number} need
 * @param {{ blocked: Set<string>, exclude: Set<string>, contentFilter?: object, region?: object }} opts
 * @returns {Promise<object[]>}
 */
/**
 * Last-resort slate: fully-hydrated placeholder rows so the feed contract never returns partial items or an empty list.
 */
function buildGuaranteedPlaceholderFeedItems(limit) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const out = [];
  for (let i = 0; i < lim; i += 1) {
    const cid = `millo:platform-welcome:${i}`;
    const user = {
      id: 'millo-platform',
      displayName: 'Millo',
      username: 'millo',
      avatarUrl: null,
    };
    const stats = { likes: 0, comments: 0, shares: 0, viewers: 0, watchTimeSeconds: 0 };
    const video = {
      id: cid,
      title: i === 0 ? 'Welcome to Millo' : 'Discover creators',
      thumbnailUrl: null,
      playbackUrl: null,
      status: 'ended',
      user,
      stats,
    };
    out.push({
      rank: i + 1,
      score: 0,
      contentId: cid,
      creatorId: 'millo-platform',
      type: 'short',
      video,
      videoUrl: null,
      thumbnailUrl: null,
      creatorName: 'Millo',
      feedPlaceholder: true,
    });
  }
  return out;
}

async function fetchTrendingHydratedForFeed(need, opts) {
  const {
    blocked,
    exclude,
    contentFilter = {},
    region = {},
    trendingOffset = 0,
  } = opts;
  const lim = Math.min(50, Math.max(need, 1));
  const off = Math.max(0, Math.floor(Number(trendingOffset) || 0));
  let rows = [];
  try {
    rows = await discoveryService.getFeed('trending', {
      userId: null,
      limit: lim * 2,
      offset: off,
      region,
      contentFilter,
    });
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out = [];
  let r = 1;
  for (const row of rows) {
    if (out.length >= need) break;
    const cid = String(row.id != null ? row.id : '');
    if (!cid || exclude.has(cid)) continue;
    if (row.creatorId && blocked.has(String(row.creatorId))) continue;
    const it = trendingRowToFeedItem(row, r);
    if (!isCompleteFeedItem(it)) continue;
    exclude.add(cid);
    out.push(it);
    r += 1;
  }
  return out;
}

/**
 * @param {object[]} items
 * @returns {Promise<object[]>}
 */
async function hydrateSkeletalFeedItems(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const idSet = new Set();
  for (const it of items) {
    if (!it || it.type === 'ad' || isCompleteFeedItem(it)) continue;
    const sid = String(it.contentId || '').trim();
    if (isLikelyObjectId(sid)) idSet.add(sid);
  }
  const unique = [...idSet];
  if (unique.length === 0) {
    return items.map((it) => {
      if (!it || it.type === 'ad' || isCompleteFeedItem(it)) return it;
      return { ...it, _hydrationFailed: true };
    });
  }

  const streams = await db.LiveStream.find({ _id: { $in: unique } }).lean();
  const streamMap = Object.fromEntries(streams.map((s) => [String(s._id), s]));
  const creatorIds = [...new Set(streams.map((s) => String(s.userId)))];
  const profiles = await db.Profile.find({ userId: { $in: creatorIds } }).lean();
  const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
  const streamIds = streams.map((s) => s._id);
  const [engRows, viewers, likes, shares, comments] = await Promise.all([
    streamIds.length
      ? db.ContentEngagement.find({ contentId: { $in: streamIds }, contentType: 'stream' }).lean()
      : [],
    streamIds.length
      ? db.LiveViewer.aggregate([
          { $match: { streamId: { $in: streamIds }, active: true } },
          { $group: { _id: '$streamId', count: { $sum: 1 } } },
        ]).catch(() => [])
      : [],
    streamIds.length
      ? db.StreamLike.aggregate([
          { $match: { streamId: { $in: streamIds } } },
          { $group: { _id: '$streamId', count: { $sum: 1 } } },
        ]).catch(() => [])
      : [],
    streamIds.length
      ? db.StreamShare.aggregate([
          { $match: { streamId: { $in: streamIds } } },
          { $group: { _id: '$streamId', count: { $sum: 1 } } },
        ]).catch(() => [])
      : [],
    streamIds.length
      ? db.StreamComment.aggregate([
          { $match: { streamId: { $in: streamIds } } },
          { $group: { _id: '$streamId', count: { $sum: 1 } } },
        ]).catch(() => [])
      : [],
  ]);
  const engMap = Object.fromEntries((engRows || []).map((e) => [String(e.contentId), e]));
  const viewerMap = Object.fromEntries((viewers || []).map((v) => [String(v._id), v.count]));
  const likeMap = Object.fromEntries((likes || []).map((l) => [String(l._id), l.count]));
  const shareMap = Object.fromEntries((shares || []).map((s) => [String(s._id), s.count]));
  const commentMap = Object.fromEntries((comments || []).map((c) => [String(c._id), c.count]));

  return items.map((it) => {
    if (!it || it.type === 'ad') return it;
    if (isCompleteFeedItem(it)) return it;
    const sid = String(it.contentId || '').trim();
    if (!isLikelyObjectId(sid)) return { ...it, _hydrationFailed: true };
    const stream = streamMap[sid];
    if (!stream) return { ...it, _hydrationFailed: true };
    const cid = String(stream.userId);
    const prof = profMap[cid] || {};
    const eng = engMap[sid] || {};
    const displayName = (prof.displayName || '').trim() || 'Creator';
    const user = {
      id: cid,
      displayName,
      username: prof.meta && typeof prof.meta === 'object' ? prof.meta.username : null,
      avatarUrl: prof.avatarUrl || null,
    };
    const stats = {
      likes: likeMap[sid] ?? eng.likes ?? 0,
      comments: commentMap[sid] ?? eng.comments ?? 0,
      shares: shareMap[sid] ?? eng.shares ?? 0,
      viewers: viewerMap[sid] ?? stream.viewerCount ?? stream.meta?.viewerCount ?? 0,
      watchTimeSeconds: eng.watchTimeSeconds ?? 0,
    };
    const playbackUrl = stream.playbackUrl || stream.recordingUrl || stream.meta?.recordingUrl || null;
    const video = {
      id: sid,
      title: stream.title || 'Stream',
      thumbnailUrl: stream.thumbnailUrl || stream.meta?.thumbnailUrl || null,
      playbackUrl,
      status: stream.status,
      user,
      stats,
    };
    return {
      ...it,
      video,
      videoUrl: playbackUrl,
      thumbnailUrl: video.thumbnailUrl,
      creatorName: displayName,
    };
  });
}

/**
 * @param {object[]} items
 * @param {{
 *   limit: number,
 *   blockedCreatorIds?: string[],
 *   hasMore?: boolean,
 *   contentFilter?: object,
 *   region?: object,
 *   feedPageOffset?: number,
 *   allowTrendingWhenEmpty?: boolean,
 * }} options
 * @returns {Promise<{ items: object[], hasMore: boolean, usedFallback: boolean }>}
 */
async function finalizeFeedOrganicItems(items, options) {
  const {
    limit,
    blockedCreatorIds = [],
    hasMore: inputHasMore = false,
    contentFilter = {},
    region = {},
    feedPageOffset = 0,
    allowTrendingWhenEmpty = true,
  } = options;
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const pageOff = Math.max(0, Math.floor(Number(feedPageOffset) || 0));
  const blocked = new Set(blockedCreatorIds.map(String));

  let working = Array.isArray(items) ? items.filter((it) => it && (!it.creatorId || !blocked.has(String(it.creatorId)))) : [];
  if (working.length === 0 && !allowTrendingWhenEmpty) {
    return { items: [], hasMore: false, usedFallback: false };
  }

  let hydrated = await hydrateSkeletalFeedItems(working);
  hydrated = hydrated.filter((it) => it && !it._hydrationFailed);
  hydrated = hydrated.filter(isCompleteFeedItem);

  const exclude = new Set(hydrated.map((h) => String(h.contentId || '')));
  let usedFallback = false;

  if (hydrated.length < lim) {
    const need = lim - hydrated.length + 8;
    const pad = await fetchTrendingHydratedForFeed(need, {
      blocked,
      exclude,
      contentFilter,
      region,
      trendingOffset: hydrated.length === 0 ? pageOff : 0,
    });
    for (const p of pad) {
      if (hydrated.length >= lim) break;
      hydrated.push(p);
    }
    if (pad.length) usedFallback = true;
  }

  if (hydrated.length === 0) {
    hydrated = buildGuaranteedPlaceholderFeedItems(lim);
    usedFallback = true;
  }

  hydrated = hydrated.slice(0, lim);
  hydrated = hydrated.map((it, i) => ({ ...it, rank: i + 1 }));

  const shortPage = hydrated.length < lim;
  const placeholderOnly = hydrated.every((it) => it && it.feedPlaceholder === true);
  const hasMore =
    hydrated.length > 0 &&
    !placeholderOnly &&
    (Boolean(inputHasMore) || (!shortPage && usedFallback));

  return { items: hydrated, hasMore, usedFallback };
}

module.exports = {
  isCompleteFeedItem,
  finalizeFeedOrganicItems,
  hydrateSkeletalFeedItems,
  trendingRowToFeedItem,
  buildGuaranteedPlaceholderFeedItems,
};
