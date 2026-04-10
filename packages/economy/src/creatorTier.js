/**
 * Creator Tier Service — resolve creator tier by subscriber count or override.
 * Tiers: Starter, Growth, Pro, Enterprise. Better revenue share as creators grow.
 * https://milloapp.com
 */
const db = require('@millo/database');

const DEFAULT_TIER = {
  name: 'starter',
  ppvPlatformFee: 25,
  subscriptionPlatformFee: 25,
  shopCommission: 25,
  liveCommission: 25,
};

/** Get subscriber count for a creator. */
async function getSubscriberCount(creatorId) {
  if (!creatorId) return 0;
  const count = await db.Subscription.countDocuments({
    creatorId,
    status: 'active',
    endsAt: { $gt: new Date() },
  });
  return count;
}

/** Get the CreatorTier for a creator. Uses Profile.creatorTier override if set, else highest tier by subscriber count. */
async function getCreatorTier(creatorId) {
  if (!creatorId) return DEFAULT_TIER;
  try {
    const [profile, tiers, subCount] = await Promise.all([
      db.Profile.findOne({ userId: creatorId }).select('creatorTier').lean(),
      db.CreatorTier.find({}).sort({ minimumSubscribers: -1 }).lean(),
      getSubscriberCount(creatorId),
    ]);

    // Override: Profile.creatorTier (starter, growth, pro, enterprise). Also accept legacy 'standard' -> starter
    const override = profile?.creatorTier;
    if (override && tiers.length > 0) {
      const key = String(override).toLowerCase().replace('standard', 'starter');
      const match = tiers.find((t) => t.name?.toLowerCase() === key);
      if (match) return match;
    }

    // Resolve by subscriber count: highest tier where subCount >= minimumSubscribers
    if (tiers.length > 0) {
      const sorted = [...tiers].sort((a, b) => (b.minimumSubscribers || 0) - (a.minimumSubscribers || 0));
      for (const tier of sorted) {
        if (subCount >= (tier.minimumSubscribers || 0)) return tier;
      }
      return sorted[sorted.length - 1] || DEFAULT_TIER;
    }
  } catch (_) {
    // fallthrough
  }
  return DEFAULT_TIER;
}

/** Get creator share % for PPV (100 - ppvPlatformFee). */
async function getPpvCreatorSharePct(creatorId) {
  const tier = await getCreatorTier(creatorId);
  const fee = tier.ppvPlatformFee ?? 25;
  return Math.max(0, 100 - fee);
}

/** Get creator share % for shop (100 - shopCommission). */
async function getShopCreatorSharePct(creatorId) {
  const tier = await getCreatorTier(creatorId);
  const fee = tier.shopCommission ?? 25;
  return Math.max(0, 100 - fee);
}

/** Get creator share % for subscriptions (100 - subscriptionPlatformFee). */
async function getSubscriptionCreatorSharePct(creatorId) {
  const tier = await getCreatorTier(creatorId);
  const fee = tier.subscriptionPlatformFee ?? 25;
  return Math.max(0, 100 - fee);
}

/** Get creator share % for live/gifts (100 - liveCommission). */
async function getLiveCreatorSharePct(creatorId) {
  const tier = await getCreatorTier(creatorId);
  const fee = tier.liveCommission ?? 25;
  return Math.max(0, 100 - fee);
}

/** Seed default tiers. Idempotent — upserts by name. */
async function seedDefaultTiers() {
  const tiers = [
    {
      name: 'Starter',
      minimumSubscribers: 0,
      subscriptionPlatformFee: 30,
      ppvPlatformFee: 25,
      shopCommission: 25,
      liveCommission: 25,
      sortOrder: 1,
      benefits: ['Basic analytics', 'Creator storefront', 'Go live'],
    },
    {
      name: 'Growth',
      minimumSubscribers: 100,
      subscriptionPlatformFee: 25,
      ppvPlatformFee: 22,
      shopCommission: 22,
      liveCommission: 22,
      sortOrder: 2,
      benefits: ['Growth analytics', 'Priority support', 'Revenue boost'],
    },
    {
      name: 'Pro',
      minimumSubscribers: 1000,
      subscriptionPlatformFee: 20,
      ppvPlatformFee: 20,
      shopCommission: 20,
      liveCommission: 20,
      sortOrder: 3,
      benefits: ['Advanced analytics', 'Verified badge', 'Multi-stream', 'Custom domain'],
    },
    {
      name: 'Enterprise',
      minimumSubscribers: 10000,
      subscriptionPlatformFee: 15,
      ppvPlatformFee: 15,
      shopCommission: 15,
      liveCommission: 15,
      sortOrder: 4,
      benefits: ['Dedicated support', 'API access', 'Custom contracts', 'Revenue share 85%'],
    },
  ];

  for (const t of tiers) {
    await db.CreatorTier.findOneAndUpdate(
      { name: t.name },
      { $set: t },
      { upsert: true, new: true }
    );
  }
  return { seeded: tiers.length };
}

module.exports = {
  getCreatorTier,
  getSubscriberCount,
  getPpvCreatorSharePct,
  getShopCreatorSharePct,
  getSubscriptionCreatorSharePct,
  getLiveCreatorSharePct,
  seedDefaultTiers,
  DEFAULT_TIER,
};
