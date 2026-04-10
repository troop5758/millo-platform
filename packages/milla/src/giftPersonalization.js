/**
 * Gift Personalization AI — recommend gifts for a user.
 * Uses total_spent: diamond if > 100 cents, else rose. Extend with AI/ML.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function getTotalSpentCents(userId) {
  if (!userId) return 0;
  const r = await db.LedgerEntry.aggregate([
    { $match: { actorId: userId, amountCents: { $lt: 0 } } },
    { $group: { _id: null, total: { $sum: { $abs: '$amountCents' } } } },
  ]);
  return r[0]?.total ?? 0;
}

/**
 * Recommend a gift for a user based on spend history.
 * @param {Object} user - User object (_id, total_spent optional)
 * @returns {Promise<string>} Gift id (e.g. 'diamond', 'rose')
 */
async function recommendGift(user) {
  let totalSpent = user?.total_spent;
  if (totalSpent == null && user?._id) {
    totalSpent = await getTotalSpentCents(user._id);
  }
  if (totalSpent > 100) return 'diamond';
  return 'rose';
}

module.exports = { recommendGift, getTotalSpentCents };
