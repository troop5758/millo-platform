'use strict';
/**
 * Creator directory — GET /creators (alias-style surface; primary discovery remains /content/creators/discover).
 * https://milloapp.com
 */
const db = require('@millo/database');

async function creatorsRoutes(app) {
  app.get('/creators', async (request, reply) => {
    const sort = (request.query.sort || 'trending').toString();
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 100);

    const users = await db.User.find({
      role: 'creator',
      creatorStatus: 'approved',
      status: 'active',
      shadowBanned: { $ne: true },
    })
      .select('_id')
      .limit(300)
      .lean();

    if (!users.length) {
      return reply.send({ ok: true, creators: [], sort, limit });
    }

    const ids = users.map((u) => u._id);
    const followerAgg = await db.Follow.aggregate([
      { $match: { followingId: { $in: ids } } },
      { $group: { _id: '$followingId', followers: { $sum: 1 } } },
    ]);
    const followerMap = Object.fromEntries(followerAgg.map((x) => [String(x._id), x.followers]));

    const profiles = await db.Profile.find({ userId: { $in: ids }, shadowBanned: { $ne: true } })
      .select('userId displayName avatarUrl bio meta followerCount')
      .lean();

    let rows = profiles.map((p) => {
      const uid = String(p.userId);
      return {
        _id: p.userId,
        displayName: p.displayName || 'Creator',
        handle: p.meta?.username || '',
        avatarUrl: p.avatarUrl || null,
        bio: p.bio || '',
        followers: followerMap[uid] ?? p.followerCount ?? 0,
        earnings: Number(p.meta?.totalEarningsCents) || 0,
      };
    });

    if (sort === 'trending') {
      rows.sort((a, b) => b.followers - a.followers);
    } else {
      rows.sort((a, b) => b.earnings - a.earnings || b.followers - a.followers);
    }

    return reply.send({ ok: true, creators: rows.slice(0, limit), sort, limit });
  });
}

module.exports = { creatorsRoutes };
