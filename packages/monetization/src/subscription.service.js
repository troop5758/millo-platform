/**
 * Subscription Service - creator subscriptions.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function getCreatorSubscriptions(creatorId, status) {
  const query = { creatorId };
  if (status && status !== 'all') query.status = status;
  return db.Subscription.find(query).sort({ createdAt: -1 }).lean();
}

async function getSubscriberCount(creatorId) {
  return db.Subscription.countDocuments({
    creatorId,
    status: 'active',
    endsAt: { $gt: new Date() },
  });
}

async function getCreatorTier(creatorId) {
  const profile = await db.Profile.findOne({ userId: creatorId }).select('creatorTier').lean();
  return profile?.creatorTier || 'standard';
}

module.exports = {
  getCreatorSubscriptions,
  getSubscriberCount,
  getCreatorTier,
};
