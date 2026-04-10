'use strict';
/**
 * Live stream bot detection — viewers with zero watch time, chat spam, identical join times, viewer join rate.
 * If viewerJoinRate > threshold (or other signals), flag stream for review.
 * https://milloapp.com
 */
const db = require('@millo/database');

const VIEWER_JOIN_WINDOW_MS = Number(process.env.LIVE_BOT_JOIN_WINDOW_MS) || 60 * 1000; // 1 min
const VIEWER_JOIN_RATE_THRESHOLD = Number(process.env.LIVE_BOT_JOIN_RATE_THRESHOLD) || 120; // joins per minute
const ZERO_WATCH_SEC = Number(process.env.LIVE_BOT_ZERO_WATCH_SEC) || 5;
const ZERO_WATCH_LOOKBACK_MS = Number(process.env.LIVE_BOT_ZERO_WATCH_LOOKBACK_MS) || 10 * 60 * 1000; // 10 min
const ZERO_WATCH_RATIO_THRESHOLD = Number(process.env.LIVE_BOT_ZERO_WATCH_RATIO) || 0.7; // 70% left within 5s
const IDENTICAL_JOIN_BUCKET_SEC = 1;
const IDENTICAL_JOIN_BUCKET_THRESHOLD = Number(process.env.LIVE_BOT_IDENTICAL_JOIN_THRESHOLD) || 25;
const CHAT_SPAM_WINDOW_MS = 2 * 60 * 1000; // 2 min
const CHAT_SPAM_MSGS_PER_USER = Number(process.env.LIVE_BOT_CHAT_SPAM_MSGS) || 15;

/**
 * Viewer join rate: count of joins in the last window. Returns { count, ratePerMinute }.
 */
async function getViewerJoinRate(streamId, windowMs = VIEWER_JOIN_WINDOW_MS) {
  const since = new Date(Date.now() - windowMs);
  const count = await db.LiveViewer.countDocuments({
    streamId,
    joinedAt: { $gte: since },
  });
  const ratePerMinute = windowMs >= 60000 ? (count / (windowMs / 60000)) : count * (60000 / Math.max(1000, windowMs));
  return { count, ratePerMinute };
}

/**
 * Signal: high ratio of viewers who left within ZERO_WATCH_SEC (zero effective watch time).
 */
async function getZeroWatchTimeSignal(streamId) {
  const since = new Date(Date.now() - ZERO_WATCH_LOOKBACK_MS);
  const viewers = await db.LiveViewer.find({
    streamId,
    joinedAt: { $gte: since },
  })
    .select('joinedAt leftAt')
    .lean();
  let zeroWatch = 0;
  const now = Date.now();
  for (const v of viewers) {
    const left = v.leftAt ? new Date(v.leftAt).getTime() : now;
    const joined = new Date(v.joinedAt).getTime();
    if (left - joined < ZERO_WATCH_SEC * 1000) zeroWatch++;
  }
  const total = viewers.length;
  const ratio = total > 0 ? zeroWatch / total : 0;
  return {
    zeroWatchCount: zeroWatch,
    totalJoins: total,
    ratio,
    suspicious: total >= 10 && ratio >= ZERO_WATCH_RATIO_THRESHOLD,
  };
}

/**
 * Signal: many joins in the same second (identical or near-identical join times).
 */
async function getIdenticalJoinTimesSignal(streamId) {
  const since = new Date(Date.now() - VIEWER_JOIN_WINDOW_MS);
  const viewers = await db.LiveViewer.find({
    streamId,
    joinedAt: { $gte: since },
  })
    .select('joinedAt')
    .lean();
  const bySecond = new Map();
  for (const v of viewers) {
    const sec = Math.floor(new Date(v.joinedAt).getTime() / 1000);
    bySecond.set(sec, (bySecond.get(sec) || 0) + 1);
  }
  const maxInBucket = bySecond.size ? Math.max(...bySecond.values()) : 0;
  return {
    maxJoinsInSameSecond: maxInBucket,
    suspicious: maxInBucket >= IDENTICAL_JOIN_BUCKET_THRESHOLD,
  };
}

/**
 * Signal: chat spam — same user sending many messages in short window, or many identical messages.
 */
async function getChatSpamSignal(streamId) {
  const since = new Date(Date.now() - CHAT_SPAM_WINDOW_MS);
  const comments = await db.StreamComment.find({
    streamId,
    deletedAt: null,
    createdAt: { $gte: since },
  })
    .select('userId text createdAt')
    .lean();
  const byUser = new Map();
  const textCounts = new Map();
  for (const c of comments) {
    const uid = String(c.userId);
    byUser.set(uid, (byUser.get(uid) || 0) + 1);
    const t = (c.text || '').trim().toLowerCase().slice(0, 100);
    if (t) textCounts.set(t, (textCounts.get(t) || 0) + 1);
  }
  const maxPerUser = byUser.size ? Math.max(...byUser.values()) : 0;
  const maxDuplicate = textCounts.size ? Math.max(...textCounts.values()) : 0;
  return {
    messagesInWindow: comments.length,
    maxMessagesPerUser: maxPerUser,
    maxSameText: maxDuplicate,
    suspicious: maxPerUser >= CHAT_SPAM_MSGS_PER_USER || (maxDuplicate >= 5 && comments.length >= 10),
  };
}

/**
 * Run all checks and flag stream if any signal is suspicious.
 * @param {string|ObjectId} streamId
 * @returns {Promise<{ flagged: boolean, signals: string[], viewerJoinRate: number, zeroWatch?: object, identicalJoin?: object, chatSpam?: object }>}
 */
async function flagStream(streamId) {
  if (!streamId) return { flagged: false, signals: [], viewerJoinRate: 0 };

  const [joinRate, zeroWatch, identicalJoin, chatSpam] = await Promise.all([
    getViewerJoinRate(streamId),
    getZeroWatchTimeSignal(streamId),
    getIdenticalJoinTimesSignal(streamId),
    getChatSpamSignal(streamId),
  ]);

  const signals = [];
  if (joinRate.ratePerMinute > VIEWER_JOIN_RATE_THRESHOLD) {
    signals.push('high_viewer_join_rate');
  }
  if (zeroWatch.suspicious) {
    signals.push('viewers_zero_watch_time');
  }
  if (identicalJoin.suspicious) {
    signals.push('identical_join_times');
  }
  if (chatSpam.suspicious) {
    signals.push('chat_spam');
  }

  const flagged = signals.length > 0;

  if (flagged) {
    await db.FraudEvent.create({
      userId: null,
      eventType: 'viewer_spike',
      action: 'review',
      refType: 'stream',
      refId: String(streamId),
      meta: {
        live_bot_signals: signals,
        viewerJoinRate: joinRate.ratePerMinute,
        zeroWatch: zeroWatch.suspicious ? zeroWatch : undefined,
        identicalJoin: identicalJoin.suspicious ? identicalJoin : undefined,
        chatSpam: chatSpam.suspicious ? chatSpam : undefined,
      },
    }).catch(() => {});
  }

  return {
    flagged,
    signals,
    viewerJoinRate: joinRate.ratePerMinute,
    zeroWatch,
    identicalJoin,
    chatSpam,
  };
}

function getViewerJoinRateThreshold() {
  return VIEWER_JOIN_RATE_THRESHOLD;
}

module.exports = {
  flagStream,
  getViewerJoinRate,
  getZeroWatchTimeSignal,
  getIdenticalJoinTimesSignal,
  getChatSpamSignal,
  getViewerJoinRateThreshold,
};
