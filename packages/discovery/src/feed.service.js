'use strict';
/**
 * End-to-end For You pipeline: candidates → policy → features → heuristic scores → diversity.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { generateCandidates } = require('./candidateGenerator');
const { filterCandidates } = require('./policyFilter');
const { buildPairFeatures } = require('./featureBuilder');
const { scoreFeatures } = require('./ranker');
const { diversifyAndCap } = require('./postRanker');
const { injectExploration } = require('./exploration');
const { isUserColdStart, getColdStartExplorationRatio, isExploreCandidateRow } = require('./coldStart');
const { applyBusinessRules } = require('./businessRules');
const { getFollowedCreatorIds } = require('./candidateGenerator');

/** Max ranked rows for following feed pagination (chronological window). */
const FOLLOWING_MAX_WINDOW = 500;

function toTimeMs(d) {
  if (d == null) return 0;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Distinct creators, HHI, diversity ratio for metrics (Part 17).
 * @param {Array<{ item?: { creatorId?: unknown } }>} rows
 */
function slateCreatorStats(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const n = list.length || 1;
  const counts = {};
  for (const r of list) {
    const c = r?.item?.creatorId != null ? String(r.item.creatorId) : '';
    if (!c) continue;
    counts[c] = (counts[c] || 0) + 1;
  }
  const distinct = Object.keys(counts).length;
  let hhi = 0;
  for (const v of Object.values(counts)) {
    const p = v / n;
    hhi += p * p;
  }
  return {
    distinctCreators: distinct,
    creatorHhi: hhi,
    distinctCreatorsRatio: distinct / n,
  };
}

/**
 * @typedef {object} BuildForYouContext
 * @property {string[]} [blockedCreatorIds]
 * @property {string[]} [hiddenContentIds]
 * @property {Array<{ eventType?: string, topic?: string, type?: string }>} [recentEvents] - Session events for deriveSessionBoosts
 * @property {boolean} [hideCommerce]
 * @property {number} [adsEveryNSlots] - max 1 ad per N consecutive slots (0 = disabled)
 * @property {number} [maxPerCreatorInWindow]
 * @property {number} [creatorWindowSize]
 * @property {number} [maxCommerceInWindow]
 * @property {number} [commerceWindowSize]
 * @property {number} [maxLiveInWindow]
 * @property {number} [liveWindowSize]
 * @property {number} [maxLiveTotal]
 * @property {number} [maxAdsTotal]
 * @property {number} [userLiveSkipRate] - lowers live density in window when user skips lives
 * @property {Partial<Record<'wLongWatch'|'wLike'|'wShare'|'wFollow'|'wFreshness'|'wExplore'|'wFastSkip'|'wTrustPenalty', number>>} [rankWeightOverrides]
 * @property {string} [experimentBucket] - Label for metrics / Kafka (e.g. rank_v1, rank_v2, control)
 */

/** Max items ranked in one pipeline run; offsets beyond this return empty pages. */
const FOR_YOU_MAX_WINDOW = 200;

/**
 * @param {{ userId: string, context?: BuildForYouContext, limit?: number, offset?: number, observe?: function }} args
 * @returns {Promise<{ items: Array<{ rank: number, score: number, contentId: string, creatorId: string|null, type: string }>, hasMore: boolean, nextCursor: string|null }>}
 */
async function buildForYouFeed({ userId, context = {}, limit = 50, offset = 0, observe }) {
  const t0 = Date.now();
  const uid = String(userId);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 50));
  let pageOffset = Math.max(0, Math.floor(Number(offset) || 0));
  if (pageOffset > FOR_YOU_MAX_WINDOW) pageOffset = FOR_YOU_MAX_WINDOW;
  const pipelineLimit = Math.min(FOR_YOU_MAX_WINDOW, pageOffset + pageSize);

  const userProfile = await db.UserProfileFeatures.findOne({ userId: uid }).lean();
  if (!userProfile) {
    return { items: [], hasMore: false, nextCursor: null };
  }

  const rawCandidates = await generateCandidates(uid, { userProfile });
  const coldUser = isUserColdStart(userProfile);
  const filtered = filterCandidates(rawCandidates, {
    language: userProfile.language,
    allowMultilingual: coldUser,
    blockedCreatorIds: context.blockedCreatorIds || [],
    hiddenContentIds: context.hiddenContentIds || [],
  });

  const weightOverrides = context.rankWeightOverrides;
  const scored = filtered.map((item) => {
    const features = buildPairFeatures(userProfile, item, context);
    const scores = scoreFeatures(features, weightOverrides);
    return { item, features, scores };
  });

  let finalRows;
  if (coldUser) {
    const expRatio = getColdStartExplorationRatio(userProfile);
    const mainPool = scored.filter((row) => !isExploreCandidateRow(row));
    const explorePool = scored.filter(isExploreCandidateRow);
    const mainSorted = [...mainPool].sort((a, b) => b.scores.finalScore - a.scores.finalScore);
    const exploreSorted = [...explorePool].sort((a, b) => b.scores.finalScore - a.scores.finalScore);
    const mainDiv = diversifyAndCap(mainSorted, { limit: pipelineLimit + 20 });
    const exploreDiv = diversifyAndCap(exploreSorted, { limit: pipelineLimit + 20 });
    finalRows = injectExploration(mainDiv, exploreDiv, expRatio, pipelineLimit);
  } else {
    const exploitation = scored.filter((x) => x.scores.explorationBonus === 0);
    const exploration = scored
      .filter((x) => x.scores.explorationBonus > 0)
      .sort((a, b) => b.scores.finalScore - a.scores.finalScore);
    const diversified = diversifyAndCap(exploitation, { limit: Math.ceil(pipelineLimit * 0.85) });
    finalRows = diversifyAndCap([...diversified, ...exploration], { limit: pipelineLimit });
  }

  const beforeBusinessRulesCount = finalRows.length;
  finalRows = applyBusinessRules(finalRows, {
    hideCommerce: context.hideCommerce === true,
    adsEveryNSlots: context.adsEveryNSlots ?? 0,
    maxPerCreatorInWindow: context.maxPerCreatorInWindow,
    creatorWindowSize: context.creatorWindowSize,
    maxCommerceInWindow: context.maxCommerceInWindow,
    commerceWindowSize: context.commerceWindowSize,
    maxLiveInWindow: context.maxLiveInWindow,
    liveWindowSize: context.liveWindowSize,
    maxLiveTotal: context.maxLiveTotal,
    maxAdsTotal: context.maxAdsTotal,
    userLiveSkipRate: context.userLiveSkipRate,
  });

  const seenContent = new Set();
  const dedupedRows = [];
  for (const row of finalRows) {
    const cid = row.item?.contentId != null ? String(row.item.contentId) : '';
    if (!cid || seenContent.has(cid)) continue;
    seenContent.add(cid);
    dedupedRows.push(row);
  }
  finalRows = dedupedRows;

  const pageSlice = finalRows.slice(pageOffset, pageOffset + pageSize);
  const hasMore = finalRows.length > pageOffset + pageSize;
  const nextCursor = hasMore
    ? Buffer.from(JSON.stringify({ o: pageOffset + pageSlice.length, v: 1 }), 'utf8').toString('base64url')
    : null;

  if (typeof observe === 'function') {
    const stats = slateCreatorStats(finalRows);
    try {
      observe({
        durationMs: Date.now() - t0,
        candidateCount: rawCandidates.length,
        afterFilterCount: filtered.length,
        beforeBusinessRulesCount,
        outputCount: finalRows.length,
        pageOffset,
        pageSize: pageSlice.length,
        finalScores: finalRows.map((r) => r.scores?.finalScore ?? 0),
        distinctCreators: stats.distinctCreators,
        distinctCreatorsRatio: stats.distinctCreatorsRatio,
        creatorHhi: stats.creatorHhi,
        coldUser,
        experimentBucket:
          context.experimentBucket != null && context.experimentBucket !== ''
            ? String(context.experimentBucket)
            : undefined,
      });
    } catch {
      /* metrics must not break feed */
    }
  }

  const items = pageSlice.map((row, index) => ({
    rank: pageOffset + index + 1,
    score: row.scores.finalScore,
    contentId: row.item.contentId != null ? String(row.item.contentId) : '',
    creatorId: row.item.creatorId != null ? String(row.item.creatorId) : null,
    type: row.item.type != null ? String(row.item.type) : 'short',
  }));

  return { items, hasMore, nextCursor };
}

/**
 * Following tab: reverse-chronological from followed creators, with light tie-breaks (live + viewers).
 * Not the same as `feedGenerator.generateFollowingFeed` (discovery-heavy stream ranking for `/content/feed/following`).
 *
 * @param {{ userId: string, context?: Pick<BuildForYouContext, 'blockedCreatorIds'|'hiddenContentIds'>, limit?: number, offset?: number, observe?: function }} args
 * @returns {Promise<{ items: Array<{ rank: number, score: number, contentId: string, creatorId: string|null, type: string }>, hasMore: boolean, nextCursor: string|null }>}
 */
async function buildFollowingFeedLight({ userId, context = {}, limit = 50, offset = 0, observe }) {
  const t0 = Date.now();
  const uid = String(userId);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 50));
  let pageOffset = Math.max(0, Math.floor(Number(offset) || 0));
  if (pageOffset > FOLLOWING_MAX_WINDOW) pageOffset = FOLLOWING_MAX_WINDOW;
  const fetchCap = Math.min(FOLLOWING_MAX_WINDOW, pageOffset + pageSize + 80);

  const followedIds = await getFollowedCreatorIds(uid);
  const blocked = new Set((context.blockedCreatorIds || []).map(String));
  const hidden = new Set((context.hiddenContentIds || []).map(String));
  const allowedCreators = followedIds.map(String).filter((id) => id && !blocked.has(id));

  if (allowedCreators.length === 0) {
    return { items: [], hasMore: false, nextCursor: null };
  }

  const [vodRows, liveRows] = await Promise.all([
    db.ContentFeatures.find({
      creatorId: { $in: allowedCreators },
      moderationState: 'approved',
    })
      .sort({ createdAt: -1 })
      .limit(Math.min(fetchCap * 2, 400))
      .lean(),
    db.LiveStream.find({
      userId: { $in: allowedCreators },
      status: 'live',
      visibility: 'public',
      removedAt: null,
    })
      .sort({ startedAt: -1, createdAt: -1 })
      .limit(80)
      .lean(),
  ]);

  const merged = [];
  for (const s of liveRows) {
    const sortMs = toTimeMs(s.startedAt || s.createdAt);
    const viewerCount = Number(s.viewerCount) || 0;
    merged.push({
      sortMs,
      isLive: true,
      viewerCount,
      contentId: String(s._id),
      creatorId: s.userId != null ? String(s.userId) : null,
      type: 'live',
    });
  }
  for (const r of vodRows) {
    const cid = r.contentId != null ? String(r.contentId) : '';
    if (!cid || hidden.has(cid)) continue;
    merged.push({
      sortMs: toTimeMs(r.createdAt),
      isLive: false,
      viewerCount: 0,
      contentId: cid,
      creatorId: r.creatorId != null ? String(r.creatorId) : null,
      type: r.type != null ? String(r.type) : 'short',
    });
  }

  merged.sort((a, b) => {
    if (b.sortMs !== a.sortMs) return b.sortMs - a.sortMs;
    if (a.isLive !== b.isLive) return (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0);
    return (b.viewerCount || 0) - (a.viewerCount || 0);
  });

  const seen = new Set();
  const deduped = [];
  for (const row of merged) {
    if (seen.has(row.contentId)) continue;
    seen.add(row.contentId);
    deduped.push(row);
    if (deduped.length >= fetchCap) break;
  }

  const pageSlice = deduped.slice(pageOffset, pageOffset + pageSize);
  const hasMore = deduped.length > pageOffset + pageSize;
  const nextCursor = hasMore
    ? Buffer.from(JSON.stringify({ o: pageOffset + pageSlice.length, v: 1 }), 'utf8').toString('base64url')
    : null;

  if (typeof observe === 'function') {
    try {
      observe({
        durationMs: Date.now() - t0,
        feedPipeline: 'following_chronological_light',
        outputCount: deduped.length,
        pageOffset,
        pageSize: pageSlice.length,
      });
    } catch {
      /* non-fatal */
    }
  }

  const items = pageSlice.map((row, index) => {
    const liveTie = row.isLive ? Math.min(row.viewerCount || 0, 100_000) * 1e-6 : 0;
    const lightScore = row.sortMs + liveTie;
    return {
      rank: pageOffset + index + 1,
      score: lightScore,
      contentId: row.contentId,
      creatorId: row.creatorId,
      type: row.type,
    };
  });

  return { items, hasMore, nextCursor };
}

module.exports = {
  buildForYouFeed,
  buildFollowingFeedLight,
  slateCreatorStats,
  FOR_YOU_MAX_WINDOW,
  FOLLOWING_MAX_WINDOW,
};
