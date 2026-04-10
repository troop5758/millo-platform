'use strict';
/**
 * Phase 7 — Feed Generator. Global, regional, following, trending, shopping feeds.
 * https://milloapp.com
 */
const db = require('@millo/database');
const mongoose = require('mongoose');
const { rankDiscovery } = require('./rankingEngine');
const { calculateScore } = require('./engagementScore');
const { attachKafkaDiscoveryRankScores } = require('./redisDiscoveryRank');

/** Apply Kafka→Redis discovery scores then rank. */
async function rankDiscoveryWithRedis(items) {
  await attachKafkaDiscoveryRankScores(items);
  return rankDiscovery(items);
}

/**
 * Merge content filter into query (Phase 9 adult compliance).
 */
function mergeContentFilter(query, contentFilter) {
  if (!contentFilter || Object.keys(contentFilter).length === 0) return query;
  return { ...query, ...contentFilter };
}

/**
 * Fetch and enrich stream items with engagement signals.
 */
async function fetchStreamItems(query, limit, userIds, contentFilter = {}) {
  const merged = { ...mergeContentFilter(query, contentFilter), removedAt: null };
  const streams = await db.LiveStream.find(merged)
    .sort({ startedAt: -1, createdAt: -1 })
    .limit(limit * 2)
    .lean();
  if (streams.length === 0) return [];
  const ids = streams.map((s) => s._id);
  const creatorIds = [...new Set(streams.map((s) => String(s.userId)))];
  const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [profiles, levels, trustScores, viewers, engagement, likes, shares, comments, followCounts, accelerators,
    ppvByStream, giftByCreator, subCountByCreator] = await Promise.all([
    db.Profile.find({ userId: { $in: creatorIds } }).lean(),
    db.Level.find({ userId: { $in: creatorIds } }).lean(),
    db.TrustScore.aggregate([
      { $match: { userId: { $in: creatorIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: '$userId', score: { $sum: '$score' } } },
    ]),
    db.LiveViewer.aggregate([
      { $match: { streamId: { $in: ids }, active: true } },
      { $group: { _id: '$streamId', count: { $sum: 1 } } },
    ]),
    db.ContentEngagement.find({ contentId: { $in: ids }, contentType: 'stream' }).lean(),
    db.StreamLike.aggregate([
      { $match: { streamId: { $in: ids } } },
      { $group: { _id: '$streamId', count: { $sum: 1 } } },
    ]),
    db.StreamShare.aggregate([
      { $match: { streamId: { $in: ids } } },
      { $group: { _id: '$streamId', count: { $sum: 1 } } },
    ]),
    db.StreamComment.aggregate([
      { $match: { streamId: { $in: ids } } },
      { $group: { _id: '$streamId', count: { $sum: 1 } } },
    ]),
    db.Follow.aggregate([
      { $match: { followingId: { $in: creatorIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: '$followingId', count: { $sum: 1 } } },
    ]),
    db.CreatorAccelerator.find({ creatorId: { $in: creatorIds } }).select('creatorId algorithmBoost featured').lean(),
    db.PpvAnalytics.aggregate([
      { $match: { streamId: { $in: ids }, date: { $gte: d30 } } },
      { $group: { _id: '$streamId', purchaseCount: { $sum: '$purchaseCount' }, uniqueViewers: { $sum: '$uniqueViewers' }, revenueCents: { $sum: '$revenueCents' } } },
    ]).catch(() => []),
    db.LedgerEntry.aggregate([
      { $match: { actorId: { $in: creatorIds.map((id) => new mongoose.Types.ObjectId(id)) }, refType: 'gift', type: 'credit', createdAt: { $gte: d30 } } },
      { $group: { _id: '$actorId', giftRevenueCents: { $sum: '$amountCents' } } },
    ]).catch(() => []),
    db.Subscription.aggregate([
      { $match: { creatorId: { $in: creatorIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: 'active', endsAt: { $gt: new Date() } } },
      { $group: { _id: '$creatorId', count: { $sum: 1 } } },
    ]).catch(() => []),
  ]);
  const profMap = Object.fromEntries((profiles || []).map((p) => [String(p.userId), p]));
  const levelMap = Object.fromEntries((levels || []).map((l) => [String(l.userId), l.level ?? 1]));
  const trustMap = Object.fromEntries((trustScores || []).map((t) => [String(t._id), Math.max(0, t.score ?? 0)]));
  const viewerMap = Object.fromEntries((viewers || []).map((v) => [String(v._id), v.count]));
  const engMap = Object.fromEntries((engagement || []).map((e) => [String(e.contentId), e]));
  const likeMap = Object.fromEntries((likes || []).map((l) => [String(l._id), l.count]));
  const shareMap = Object.fromEntries((shares || []).map((s) => [String(s._id), s.count]));
  const commentMap = Object.fromEntries((comments || []).map((c) => [String(c._id), c.count]));
  const followMap = Object.fromEntries((followCounts || []).map((f) => [String(f._id), f.count]));
  const accelMap = Object.fromEntries((accelerators || []).map((a) => [String(a.creatorId), a]));
  const ppvMap = Object.fromEntries((ppvByStream || []).map((p) => [String(p._id), p]));
  const giftMap = Object.fromEntries((giftByCreator || []).map((g) => [String(g._id), g.giftRevenueCents ?? 0]));
  const subMap = Object.fromEntries((subCountByCreator || []).map((s) => [String(s._id), s.count ?? 0]));
  return streams.map((s) => {
    const cid = String(s.userId);
    const eng = engMap[String(s._id)] || {};
    const ppv = ppvMap[String(s._id)] || {};
    const purchaseCount = ppv.purchaseCount ?? 0;
    const uniqueViewers = ppv.uniqueViewers ?? 0;
    const ppvConversion = uniqueViewers > 0 ? Math.min(1, purchaseCount / uniqueViewers) : 0;
    const giftRevenueCents = giftMap[cid] ?? 0;
    const subscriptionCount = subMap[cid] ?? 0;
    const followerCount = followMap[cid] ?? 0;
    const subscriptionConversion = followerCount > 0 ? Math.min(1, subscriptionCount / followerCount) : (subscriptionCount > 0 ? 0.1 : 0);
    const viewerCount = viewerMap[String(s._id)] ?? s.viewerCount ?? s.meta?.viewerCount ?? 0;
    const giftsValue = s.totalGiftCoins ?? 0;
    const chatActivity = commentMap[String(s._id)] ?? eng.comments ?? 0;
    const streamRankingScore = giftsValue + viewerCount + chatActivity;
    return {
      id: s._id,
      baseScore: streamRankingScore,
      level: levelMap[cid] ?? 1,
      trust: trustMap[cid] ?? 0,
      algorithmBoost: accelMap[cid]?.algorithmBoost ?? 0,
      featured: accelMap[cid]?.featured ?? false,
      shadowBanned: profMap[cid]?.shadowBanned ?? false,
      watchTimeSeconds: eng.watchTimeSeconds ?? 0,
      likes: likeMap[String(s._id)] ?? eng.likes ?? 0,
      shares: shareMap[String(s._id)] ?? eng.shares ?? 0,
      comments: chatActivity,
      streamRankingScore,
      creatorFollowers: followMap[cid] ?? 0,
      purchaseCount,
      ppvConversion,
      giftRevenueCents,
      subscriptionConversion,
      regionPopularity: eng.regionCounts ? (eng.regionCounts[userIds?.user_country] || 0) / Math.max(1, eng.viewCount || 1) : 0,
      creatorReputation: (levelMap[cid] ?? 1) * 0.5 + (trustMap[cid] ?? 0) * 0.3,
      type: s.status === 'live' ? 'live' : 'scheduled',
      title: s.title || 'Stream',
      creator: profMap[cid]?.displayName || 'Creator',
      creatorId: s.userId,
      avatarUrl: profMap[cid]?.avatarUrl,
      viewers: viewerMap[String(s._id)] ?? s.meta?.viewerCount ?? 0,
      category: s.meta?.category ?? 'general',
      thumbnailUrl: s.meta?.thumbnailUrl,
      stream: s,
    };
  });
}

/**
 * Fetch and enrich event items with ranking signals (attendance, ticket sales, chat).
 */
async function fetchEventItems(query, limit) {
  const events = await db.LiveEvent.find(query)
    .sort({ scheduledStart: 1 })
    .limit(limit)
    .lean();
  if (events.length === 0) return [];
  const creatorIds = [...new Set(events.map((e) => String(e.creatorId)))];
  const [profiles, attendance, tickets, chat] = await Promise.all([
    db.Profile.find({ userId: { $in: creatorIds } }).lean(),
    db.EventAttendance.aggregate([
      { $match: { eventId: { $in: events.map((e) => e._id) } } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ]).catch(() => []),
    db.EventAttendance.aggregate([
      { $match: { eventId: { $in: events.map((e) => e._id) }, ticketPaid: true } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ]).catch(() => []),
    db.EventComment.aggregate([
      { $match: { eventId: { $in: events.map((e) => e._id) } } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ]).catch(() => []),
  ]);
  const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
  const attMap = Object.fromEntries(attendance.map((a) => [String(a._id), a.count]));
  const ticketMap = Object.fromEntries(tickets.map((t) => [String(t._id), t.count]));
  const chatMap = Object.fromEntries(chat.map((c) => [String(c._id), c.count]));
  return events.map((e) => {
    const cid = String(e.creatorId);
    const att = attMap[String(e._id)] ?? 0;
    const ticketCount = ticketMap[String(e._id)] ?? 0;
    const chatCount = chatMap[String(e._id)] ?? 0;
    return {
      id: e._id,
      type: 'event',
      baseScore: att * 2 + ticketCount * 5 + chatCount,
      level: 1,
      trust: 0,
      likes: 0,
      shares: 0,
      comments: chatCount,
      creatorFollowers: 0,
      purchaseCount: ticketCount,
      ppvConversion: 0,
      giftRevenueCents: 0,
      subscriptionConversion: 0,
      regionPopularity: 0,
      creatorReputation: 0.5,
      title: e.title || 'Live Event',
      creator: profMap[cid]?.displayName || 'Creator',
      creatorId: e.creatorId,
      avatarUrl: profMap[cid]?.avatarUrl,
      viewers: att,
      category: 'event',
      thumbnailUrl: e.thumbnailUrl,
      stream: null,
    };
  });
}

/**
 * Global feed — all live/scheduled streams + upcoming events.
 */
async function generateGlobalFeed(limit, offset, region, contentFilter = {}) {
  const streamQuery = mergeContentFilter({ status: { $in: ['live', 'scheduled'] } }, contentFilter);
  const eventQuery = { status: 'scheduled', scheduledStart: { $gte: new Date() } };
  const [streamItems, eventItems] = await Promise.all([
    fetchStreamItems(streamQuery, limit + offset, region, contentFilter),
    fetchEventItems(eventQuery, Math.min(limit, 10)),
  ]);
  const combined = [...streamItems, ...eventItems];
  const slice = combined.slice(0, (limit + offset) * 2);
  const ranked = await rankDiscoveryWithRedis(slice);
  return ranked.slice(offset, offset + limit);
}

/**
 * Regional feed — streams popular in user's region.
 */
async function generateRegionalFeed(limit, offset, region, contentFilter = {}) {
  const country = region?.user_country || 'US';
  const query = { status: { $in: ['live', 'scheduled'] } };
  const items = await fetchStreamItems(query, limit + offset, region, contentFilter);
  const withRegion = items.map((i) => ({
    ...i,
    regionPopularity: i.regionPopularity || (country === 'US' ? 0.5 : 0.3),
  }));
  const ranked = await rankDiscoveryWithRedis(withRegion.slice(offset, offset + limit * 2));
  return ranked.slice(0, limit);
}

/**
 * Following feed — streams + events from followed creators.
 */
async function generateFollowingFeed(userId, limit, offset, region, contentFilter = {}) {
  if (!userId) return [];
  const follows = await db.Follow.find({ followerId: userId }).lean();
  const ids = follows.map((f) => f.followingId);
  if (ids.length === 0) return [];
  const streamQuery = mergeContentFilter({ userId: { $in: ids }, status: { $in: ['live', 'scheduled'] } }, contentFilter);
  const eventQuery = { creatorId: { $in: ids }, status: 'scheduled', scheduledStart: { $gte: new Date() } };
  const [streamItems, eventItems] = await Promise.all([
    fetchStreamItems(streamQuery, limit + offset, region, contentFilter),
    fetchEventItems(eventQuery, Math.min(limit, 10)),
  ]);
  const combined = [...streamItems, ...eventItems];
  const slice = combined.slice(0, (limit + offset) * 2);
  const ranked = await rankDiscoveryWithRedis(slice);
  return ranked.slice(offset, offset + limit);
}

/**
 * Trending feed — streams with high engagement velocity.
 */
async function generateTrendingFeed(limit, offset, region, contentFilter = {}) {
  const query = { status: { $in: ['live', 'scheduled'] } };
  const items = await fetchStreamItems(query, limit + offset, region, contentFilter);
  const withTrend = items.map((i) => ({
    ...i,
    baseScore: (i.baseScore || 0) * 2 + (i.likes || 0) * 3 + (i.shares || 0) * 5 + (i.comments || 0) * 2,
  }));
  const ranked = await rankDiscoveryWithRedis(withTrend.slice(offset, offset + limit * 2));
  return ranked.slice(0, limit);
}

/**
 * Shorts feed — ended streams with recordingUrl (VODs) + live streams.
 * TikTok-style vertical feed content.
 */
async function generateShortsFeed(limit, offset, region, contentFilter = {}) {
  const merged = mergeContentFilter({}, contentFilter);
  const vodQuery = { ...merged, status: 'ended', removedAt: null, $or: [{ recordingUrl: { $exists: true, $nin: [null, ''] } }, { 'meta.recordingUrl': { $exists: true, $nin: [null, ''] } }] };
  const liveQuery = { ...merged, status: 'live', removedAt: null };
  const [vodStreams, liveStreams] = await Promise.all([
    db.LiveStream.find(vodQuery).sort({ endedAt: -1 }).limit(limit + offset).lean(),
    db.LiveStream.find(liveQuery).sort({ startedAt: -1 }).limit(limit).lean(),
  ]);
  const allStreams = [...vodStreams, ...liveStreams].slice(0, limit + offset);
  if (allStreams.length === 0) return [];
  const ids = allStreams.map((s) => s._id);
  const creatorIds = [...new Set(allStreams.map((s) => String(s.userId)))];
  const [profiles, viewers, engagement, likes, shares, comments] = await Promise.all([
    db.Profile.find({ userId: { $in: creatorIds } }).lean(),
    db.LiveViewer.aggregate([
      { $match: { streamId: { $in: ids }, leftAt: null } },
      { $group: { _id: '$streamId', count: { $sum: 1 } } },
    ]),
    db.ContentEngagement.find({ contentId: { $in: ids }, contentType: 'stream' }).lean(),
    db.StreamLike.aggregate([{ $match: { streamId: { $in: ids } } }, { $group: { _id: '$streamId', count: { $sum: 1 } } }]),
    db.StreamShare.aggregate([{ $match: { streamId: { $in: ids } } }, { $group: { _id: '$streamId', count: { $sum: 1 } } }]),
    db.StreamComment.aggregate([{ $match: { streamId: { $in: ids } } }, { $group: { _id: '$streamId', count: { $sum: 1 } } }]),
  ]);
  const profMap = Object.fromEntries((profiles || []).map((p) => [String(p.userId), p]));
  const viewerMap = Object.fromEntries((viewers || []).map((v) => [String(v._id), v.count]));
  const engMap = Object.fromEntries((engagement || []).map((e) => [String(e.contentId), e]));
  const likeMap = Object.fromEntries((likes || []).map((l) => [String(l._id), l.count]));
  const shareMap = Object.fromEntries((shares || []).map((s) => [String(s._id), s.count]));
  const commentMap = Object.fromEntries((comments || []).map((c) => [String(c._id), c.count]));
  const items = allStreams.map((s) => {
    const eng = engMap[String(s._id)] || {};
    const video = {
      likes: likeMap[String(s._id)] ?? eng.likes ?? 0,
      comments: commentMap[String(s._id)] ?? eng.comments ?? 0,
      shares: shareMap[String(s._id)] ?? eng.shares ?? 0,
      watchTimeSeconds: eng.watchTimeSeconds ?? 0,
    };
    return {
      id: s._id,
      baseScore: calculateScore(video),
      type: s.status === 'live' ? 'live' : 'vod',
      title: s.title || 'Stream',
      creator: profMap[String(s.userId)]?.displayName || 'Creator',
      creatorId: s.userId,
      avatarUrl: profMap[String(s.userId)]?.avatarUrl,
      viewers: viewerMap[String(s._id)] ?? s.meta?.viewerCount ?? 0,
      category: s.meta?.category ?? 'general',
      thumbnailUrl: s.meta?.thumbnailUrl || s.thumbnailUrl,
      stream: s,
      likes: video.likes,
      comments: video.comments,
      shares: video.shares,
      watchTimeSeconds: video.watchTimeSeconds,
      engagementScore: calculateScore(video),
    };
  });
  await attachKafkaDiscoveryRankScores(items);
  return items
    .sort((a, b) => {
      const sa = (a.engagementScore ?? a.baseScore ?? 0) + (Number(a.discoveryRedisRankScore) || 0);
      const sb = (b.engagementScore ?? b.baseScore ?? 0) + (Number(b.discoveryRedisRankScore) || 0);
      return sb - sa;
    })
    .slice(offset, offset + limit);
}

/**
 * Shopping feed — products from creators.
 */
async function generateShoppingFeed(limit, offset, region, contentFilter = {}) {
  const query = mergeContentFilter({ status: 'active' }, contentFilter);
  const products = await db.Product.find(query)
    .sort({ sold: -1, createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .lean();
  const creatorIds = [...new Set(products.map((p) => String(p.creatorId)))];
  const [profiles, engagement] = await Promise.all([
    db.Profile.find({ userId: { $in: creatorIds } }).lean(),
    db.ContentEngagement.find({ contentId: { $in: products.map((p) => p._id) }, contentType: 'product' }).lean(),
  ]);
  const profMap = Object.fromEntries((profiles || []).map((p) => [String(p.userId), p]));
  const engMap = Object.fromEntries((engagement || []).map((e) => [String(e.contentId), e]));
  return products.map((p) => {
    const eng = engMap[String(p._id)] || {};
    return {
      id: p._id,
      type: 'product',
      name: p.name,
      priceCents: p.priceCents,
      imageUrl: p.imageUrls?.[0],
      creator: profMap[String(p.creatorId)]?.displayName,
      creatorId: p.creatorId,
      avatarUrl: profMap[String(p.creatorId)]?.avatarUrl,
      sold: p.sold ?? 0,
      likes: eng.likes ?? 0,
    };
  });
}

module.exports = {
  generateGlobalFeed,
  generateRegionalFeed,
  generateFollowingFeed,
  generateTrendingFeed,
  generateShoppingFeed,
  fetchStreamItems,
};
