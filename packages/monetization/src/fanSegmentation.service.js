/**
 * Fan Segmentation Service — segment fans by spend, engagement.
 * Powers: dynamic pricing, upsell targeting, mass messaging.
 * https://milloapp.com
 */
const db = require('@millo/database');

const SEGMENTS = ['whale', 'high', 'medium', 'low', 'new'];

async function getFanSegment(creatorId, fanId) {
  const profile = await db.FanProfile?.findOne?.({ creatorId, fanId })?.lean?.();
  return profile?.segment ?? 'new';
}

async function computeFanSegments(creatorId) {
  const entries = await db.LedgerEntry.aggregate([
    { $match: { actorId: creatorId, type: 'credit', 'meta.senderId': { $exists: true } } },
    { $group: { _id: '$meta.senderId', totalCents: { $sum: '$amountCents' } } },
    { $sort: { totalCents: -1 } },
  ]);
  const total = entries.reduce((s, e) => s + e.totalCents, 0);
  const p95 = total * 0.95;
  const p80 = total * 0.80;
  const p50 = total * 0.50;
  const updates = [];
  for (const e of entries) {
    let segment = 'low';
    if (e.totalCents >= p95) segment = 'whale';
    else if (e.totalCents >= p80) segment = 'high';
    else if (e.totalCents >= p50) segment = 'medium';
    updates.push(
      db.FanProfile?.updateOne?.(
        { creatorId, fanId: e._id },
        { $set: { segment, totalSpendCents: e.totalCents, updatedAt: new Date() } },
        { upsert: true }
      )
    );
  }
  await Promise.all(updates.filter(Boolean));
  return { processed: entries.length };
}

async function getSegmentFans(creatorId, segment) {
  const query = { creatorId };
  if (segment && segment !== 'all') query.segment = segment;
  return db.FanProfile?.find?.(query)?.lean?.() ?? [];
}

module.exports = {
  SEGMENTS,
  getFanSegment,
  computeFanSegments,
  getSegmentFans,
};
