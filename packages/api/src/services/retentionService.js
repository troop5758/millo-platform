'use strict';
/**
 * Phase 6 — Retention Loops. Daily streaks, engagement badges, leaderboards, creator rankings.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { credit } = require('@millo/economy');

const STREAK_REWARDS = { 3: 25, 7: 75, 14: 150, 30: 500 };
const BADGES = {
  first_gift: { name: 'First Gift', desc: 'Sent your first gift' },
  first_follow: { name: 'First Follow', desc: 'Followed your first creator' },
  week_streak: { name: 'Week Warrior', desc: '7-day login streak' },
  month_streak: { name: 'Monthly Master', desc: '30-day login streak' },
  top_supporter: { name: 'Top Supporter', desc: 'In top 10 supporters' },
  early_adopter: { name: 'Early Adopter', desc: 'Joined in first month' },
};

async function recordDailyActivity(userId) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let streak = await db.UserStreak.findOne({ userId });
  if (!streak) {
    streak = await db.UserStreak.create({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastActiveAt: now,
    });
    return { currentStreak: 1, longestStreak: 1, rewardCents: 0 };
  }
  const last = streak.lastActiveAt ? new Date(streak.lastActiveAt).getTime() : 0;
  const lastDay = last ? new Date(new Date(last).getFullYear(), new Date(last).getMonth(), new Date(last).getDate()).getTime() : 0;
  const diffDays = (today - lastDay) / (24 * 60 * 60 * 1000);
  let newStreak = streak.currentStreak || 0;
  if (diffDays === 0) return { currentStreak: streak.currentStreak, longestStreak: streak.longestStreak, rewardCents: 0 };
  if (diffDays === 1) newStreak += 1;
  else newStreak = 1;
  const longest = Math.max(newStreak, streak.longestStreak || 0);
  streak.currentStreak = newStreak;
  streak.longestStreak = longest;
  streak.lastActiveAt = now;
  let rewardCents = STREAK_REWARDS[newStreak] || 0;
  if (rewardCents > 0) {
    await credit(userId, rewardCents, 'streak_reward', `streak_${newStreak}`, { streak: newStreak });
    streak.totalRewardedCents = (streak.totalRewardedCents || 0) + rewardCents;
  }
  await streak.save();
  return { currentStreak: newStreak, longestStreak: longest, rewardCents };
}

async function awardBadge(userId, badgeId) {
  const badge = BADGES[badgeId];
  if (!badge) return null;
  const existing = await db.EngagementBadge.findOne({ userId, badgeId });
  if (existing) return existing;
  return db.EngagementBadge.create({
    userId,
    badgeId,
    badgeName: badge.name,
  });
}

async function getUserBadges(userId) {
  return db.EngagementBadge.find({ userId }).sort({ earnedAt: -1 }).lean();
}

async function getLeaderboard(type, limit = 50) {
  if (type === 'gifts') {
    const top = await db.LedgerEntry.aggregate([
      { $match: { refType: 'gift', type: 'debit' } },
      { $group: { _id: '$actorId', total: { $sum: { $abs: '$amountCents' } } } },
      { $sort: { total: -1 } },
      { $limit: limit },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $lookup: { from: 'profiles', localField: '_id', foreignField: 'userId', as: 'profile' } },
      { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
      { $project: { userId: '$_id', totalCents: '$total', displayName: '$profile.displayName', avatarUrl: '$profile.avatarUrl' } },
    ]);
    return top.map((t, i) => ({ rank: i + 1, ...t }));
  }
  if (type === 'streaks') {
    const top = await db.UserStreak.find({}).sort({ currentStreak: -1, longestStreak: -1 }).limit(limit).lean();
    const userIds = top.map((t) => t.userId);
    const profiles = await db.Profile.find({ userId: { $in: userIds } }).lean();
    const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    return top.map((t, i) => ({
      rank: i + 1,
      userId: t.userId,
      currentStreak: t.currentStreak,
      longestStreak: t.longestStreak,
      displayName: profMap[String(t.userId)]?.displayName,
      avatarUrl: profMap[String(t.userId)]?.avatarUrl,
    }));
  }
  return [];
}

async function getCreatorRankings(limit = 50) {
  const creators = await db.User.find({ creatorStatus: 'approved' }).select('_id').lean();
  const ids = creators.map((c) => c._id);
  const [revenue, followers] = await Promise.all([
    db.LedgerEntry.aggregate([
      { $match: { actorId: { $in: ids }, type: 'credit', amountCents: { $gt: 0 } } },
      { $group: { _id: '$actorId', total: { $sum: '$amountCents' } } },
      { $sort: { total: -1 } },
      { $limit: limit },
    ]),
    db.Follow.aggregate([
      { $match: { followingId: { $in: ids } } },
      { $group: { _id: '$followingId', count: { $sum: 1 } } },
    ]),
  ]);
  const followMap = Object.fromEntries(followers.map((f) => [String(f._id), f.count]));
  const profiles = await db.Profile.find({ userId: { $in: revenue.map((r) => r._id) } }).lean();
  const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
  return revenue.map((r, i) => ({
    rank: i + 1,
    creatorId: r._id,
    revenueCents: r.total,
    followers: followMap[String(r._id)] ?? 0,
    displayName: profMap[String(r._id)]?.displayName,
    avatarUrl: profMap[String(r._id)]?.avatarUrl,
  }));
}

/**
 * Top supporters for a creator — users who sent most gifts to this creator.
 */
async function getTopSupporters(creatorId, limit = 50) {
  const top = await db.LedgerEntry.aggregate([
    { $match: { refType: 'gift', type: 'debit', 'meta.receiverId': String(creatorId) } },
    { $group: { _id: '$actorId', total: { $sum: { $abs: '$amountCents' } } } },
    { $sort: { total: -1 } },
    { $limit: limit },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $lookup: { from: 'profiles', localField: '_id', foreignField: 'userId', as: 'profile' } },
    { $unwind: { path: '$profile', preserveNullAndEmptyArrays: true } },
    { $project: { userId: '$_id', totalCents: '$total', displayName: '$profile.displayName', avatarUrl: '$profile.avatarUrl' } },
  ]);
  return top.map((t, i) => ({ rank: i + 1, ...t }));
}

/**
 * Top streams — ranked by score = gifts_value + viewer_count + chat_activity.
 */
async function getTopStreams(limit = 50, window = 'live') {
  const query = window === 'live' ? { status: 'live' } : { status: { $in: ['live', 'ended'] } };
  const streams = await db.LiveStream.find(query).sort({ startedAt: -1 }).limit(limit * 3).lean();
  if (streams.length === 0) return [];
  const ids = streams.map((s) => s._id);
  const [viewers, comments, profiles] = await Promise.all([
    db.LiveViewer.aggregate([
      { $match: { streamId: { $in: ids }, leftAt: null } },
      { $group: { _id: '$streamId', count: { $sum: 1 } } },
    ]),
    db.StreamComment.aggregate([
      { $match: { streamId: { $in: ids }, deletedAt: null } },
      { $group: { _id: '$streamId', count: { $sum: 1 } } },
    ]),
    db.Profile.find({ userId: { $in: streams.map((s) => s.userId) } }).lean(),
  ]);
  const viewerMap = Object.fromEntries((viewers || []).map((v) => [String(v._id), v.count]));
  const commentMap = Object.fromEntries((comments || []).map((c) => [String(c._id), c.count]));
  const profMap = Object.fromEntries((profiles || []).map((p) => [String(p.userId), p]));
  const scored = streams.map((s) => {
    const v = viewerMap[String(s._id)] ?? s.viewerCount ?? 0;
    const c = commentMap[String(s._id)] ?? 0;
    const g = s.totalGiftCoins ?? 0;
    const score = g + v + c;
    return {
      streamId: s._id,
      title: s.title || 'Live Stream',
      creatorId: s.userId,
      displayName: profMap[String(s.userId)]?.displayName || 'Creator',
      avatarUrl: profMap[String(s.userId)]?.avatarUrl,
      score,
      giftsValue: g,
      viewerCount: v,
      chatActivity: c,
      status: s.status,
      startedAt: s.startedAt,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s, i) => ({ rank: i + 1, ...s }));
}

module.exports = {
  recordDailyActivity,
  awardBadge,
  getUserBadges,
  getLeaderboard,
  getCreatorRankings,
  getTopSupporters,
  getTopStreams,
  STREAK_REWARDS,
  BADGES,
};
