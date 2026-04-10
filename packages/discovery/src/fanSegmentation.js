/**
 * Fan Segmentation Service — automatically categorizes users by behavior.
 * https://milloapp.com
 */
const db = require('@millo/database');

const SEGMENTS = ['free_viewer', 'engaged_viewer', 'subscriber', 'high_value_fan', 'super_fan'];

/** Thresholds (totalSpent in cents). $500 → super_fan, $100 → high_value_fan. */
const SUPER_FAN_THRESHOLD = 50000;   // $500
const HIGH_VALUE_THRESHOLD = 10000;  // $100
const ENGAGED_SCORE_THRESHOLD = 50;

/**
 * Compute segment from profile metrics. Priority: super_fan > high_value_fan > subscriber > engaged_viewer > free_viewer.
 */
function computeSegment(profile) {
  const totalSpent = profile.totalSpent ?? profile.total_spent ?? 0;
  const subscriptions = profile.subscriptions ?? 0;
  const engagementScore = profile.engagementScore ?? profile.engagement_score ?? 0;

  if (totalSpent > SUPER_FAN_THRESHOLD) return 'super_fan';
  if (totalSpent > HIGH_VALUE_THRESHOLD) return 'high_value_fan';
  if (subscriptions > 0) return 'subscriber';
  if (engagementScore > ENGAGED_SCORE_THRESHOLD) return 'engaged_viewer';
  return 'free_viewer';
}

/**
 * Segment a fan profile and save. Updates profile.segment and profile.lastComputedAt.
 */
async function segmentFan(profile) {
  const segment = computeSegment(profile);
  profile.segment = segment;
  profile.lastComputedAt = new Date();
  await profile.save();
  return { segment, profile: profile.toObject() };
}

/**
 * Get or create FanProfile for userId, refresh metrics from DB, then segment.
 */
async function segmentFanByUserId(userId) {
  if (!userId) return null;
  let profile = await db.FanProfile.findOne({ userId });
  if (!profile) {
    profile = await db.FanProfile.create({
      userId,
      creatorsFollowed: 0,
      subscriptions: 0,
      totalSpent: 0,
      ppvPurchases: 0,
      coinsSpent: 0,
      engagementScore: 0,
      segment: 'free_viewer',
    });
  }

  await refreshFanProfileMetrics(profile);
  return segmentFan(profile);
}

/**
 * Refresh FanProfile metrics from Follow, Subscription, PpvPurchase, LedgerEntry, etc.
 */
async function refreshFanProfileMetrics(profile) {
  const userId = profile.userId;
  const [follows, subs, ppvPurchases, debitResult, giftDebitCents, likesCount, sharesCount, savesCount, watchSeconds] = await Promise.all([
    db.Follow.countDocuments({ followerId: userId }),
    db.Subscription.countDocuments({ userId, status: 'active', endsAt: { $gt: new Date() } }),
    db.PpvPurchase.countDocuments({ userId }),
    db.LedgerEntry.aggregate([
      { $match: { type: 'debit', actorId: userId } },
      { $group: { _id: null, total: { $sum: '$amountCents' } } },
    ]).then((r) => r[0]?.total ?? 0),
    db.LedgerEntry.aggregate([
      { $match: { type: 'debit', actorId: userId, refType: 'gift' } },
      { $group: { _id: null, total: { $sum: '$amountCents' } } },
    ]).then((r) => Math.abs(r[0]?.total ?? 0)),
    db.StreamLike.countDocuments({ userId }),
    db.StreamShare.countDocuments({ userId }),
    db.ContentBookmark.countDocuments({ userId }),
    db.LiveViewer.aggregate([
      { $match: { userId, leftAt: { $ne: null } } },
      { $project: { duration: { $subtract: ['$leftAt', '$joinedAt'] } } },
      { $group: { _id: null, totalSeconds: { $sum: { $divide: ['$duration', 1000] } } } },
    ]).then((r) => Math.floor(r[0]?.totalSeconds ?? 0)),
  ]);

  const totalSpent = Math.abs(debitResult);
  const engagementScore = likesCount * 5 + sharesCount * 10 + savesCount * 3 + Math.floor(watchSeconds / 60);

  profile.creatorsFollowed = follows;
  profile.subscriptions = subs;
  profile.ppvPurchases = ppvPurchases;
  profile.coinsSpent = giftDebitCents;
  profile.totalSpent = totalSpent;
  profile.engagementScore = engagementScore;
  await profile.save();
  return profile;
}

module.exports = {
  segmentFan,
  segmentFanByUserId,
  refreshFanProfileMetrics,
  computeSegment,
  SEGMENTS,
  SUPER_FAN_THRESHOLD,
  HIGH_VALUE_THRESHOLD,
  ENGAGED_SCORE_THRESHOLD,
};
