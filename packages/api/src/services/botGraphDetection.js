'use strict';
/**
 * Bot Farm Graph Detection — dense interaction clusters, centrality, interaction density.
 * Uses: community detection (device/IP/same-day + mutual interactions), high-density nodes,
 * mutual like/comment/follow pairs. Production systems often use graph DBs or GNNs.
 * https://milloapp.com
 */
const db = require('@millo/database');

const RAPID_GAP_MS = Number(process.env.BOT_GRAPH_RAPID_GAP_MS) || 5000;
const RAPID_COUNT_THRESHOLD = Number(process.env.BOT_GRAPH_RAPID_COUNT_THRESHOLD) || 50;
const CLUSTER_SIZE_THRESHOLD = Number(process.env.BOT_GRAPH_CLUSTER_SIZE_THRESHOLD) || 3;
const HIGH_DENSITY_THRESHOLD = Number(process.env.BOT_GRAPH_HIGH_DENSITY_THRESHOLD) || 500;
const MUTUAL_EDGE_MIN = Number(process.env.BOT_GRAPH_MUTUAL_EDGE_MIN) || 3;
const INTERACTION_WINDOW_DAYS = Number(process.env.BOT_GRAPH_INTERACTION_WINDOW_DAYS) || 30;

/**
 * Get all interactions for a user (follows + likes). Likes are resolved to stream owner as targetId.
 * @returns {Promise<Array<{ targetId: string, type: string, timestamp: Date }>>}
 */
async function getInteractionsForUser(userId) {
  if (!userId) return [];
  const uid = userId.toString?.() || userId;
  const out = [];

  const follows = await db.Follow.find({ followerId: uid }).select('followingId createdAt').lean();
  for (const f of follows) {
    out.push({ targetId: String(f.followingId), type: 'follow', timestamp: f.createdAt || new Date(0) });
  }

  const likes = await db.StreamLike.find({ userId: uid }).select('streamId createdAt').lean();
  if (likes.length > 0) {
    const streamIds = [...new Set(likes.map((l) => l.streamId))];
    const streams = await db.LiveStream.find({ _id: { $in: streamIds } }).select('userId').lean();
    const streamToOwner = Object.fromEntries(streams.map((s) => [String(s._id), String(s.userId)]));
    for (const l of likes) {
      const targetId = streamToOwner[l.streamId];
      if (targetId) out.push({ targetId, type: 'like', timestamp: l.createdAt || new Date(0) });
    }
  }

  out.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return out;
}

/**
 * True if user has many interactions in very short succession (e.g. 50+ with gap < 5s).
 */
async function detectRapidInteractions(userId) {
  const interactions = await getInteractionsForUser(userId);
  if (interactions.length < 2) return false;
  let suspiciousCount = 0;
  for (let i = 1; i < interactions.length; i++) {
    const prev = new Date(interactions[i - 1].timestamp).getTime();
    const curr = new Date(interactions[i].timestamp).getTime();
    if (curr - prev < RAPID_GAP_MS) suspiciousCount++;
  }
  return suspiciousCount >= RAPID_COUNT_THRESHOLD;
}

/**
 * Count of rapid interactions (consecutive pairs with gap < RAPID_GAP_MS).
 */
async function getRapidInteractionCount(userId) {
  const interactions = await getInteractionsForUser(userId);
  if (interactions.length < 2) return 0;
  let count = 0;
  for (let i = 1; i < interactions.length; i++) {
    const prev = new Date(interactions[i - 1].timestamp).getTime();
    const curr = new Date(interactions[i].timestamp).getTime();
    if (curr - prev < RAPID_GAP_MS) count++;
  }
  return count;
}

/**
 * User IDs that share at least one device fingerprint with this user (excluding self).
 */
async function getClusterByDevice(userId) {
  if (!userId) return [];
  const uid = userId.toString?.() || userId;
  const docs = await db.DeviceFingerprint.find({ userId: uid }).select('fingerprint').lean();
  const fingerprints = [...new Set(docs.map((d) => d.fingerprint).filter(Boolean))];
  if (fingerprints.length === 0) return [];
  const userIds = await db.DeviceFingerprint.distinct('userId', { fingerprint: { $in: fingerprints } });
  return userIds.map((id) => String(id)).filter((id) => id !== uid);
}

/**
 * User IDs that share at least one IP with this user (excluding self).
 */
async function getClusterByIP(userId) {
  if (!userId) return [];
  const uid = userId.toString?.() || userId;
  const docs = await db.DeviceFingerprint.find({ userId: uid, ip: { $exists: true, $ne: '' } }).select('ip').lean();
  const ips = [...new Set(docs.map((d) => d.ip).filter(Boolean))];
  if (ips.length === 0) return [];
  const userIds = await db.DeviceFingerprint.distinct('userId', { ip: { $in: ips } });
  return userIds.map((id) => String(id)).filter((id) => id !== uid);
}

/**
 * User IDs created the same calendar day as this user (excluding self). Optional max to cap cost.
 */
async function getClusterBySameDay(userId, maxUsers = 500) {
  if (!userId) return [];
  const uid = userId.toString?.() || userId;
  const user = await db.User.findById(uid).select('createdAt').lean();
  if (!user || !user.createdAt) return [];
  const d = new Date(user.createdAt);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const users = await db.User.find(
    { _id: { $ne: uid }, createdAt: { $gte: start, $lt: end } }
  ).limit(maxUsers).select('_id').lean();
  return users.map((u) => String(u._id));
}

/**
 * Detect mutual interaction pattern: proportion of this user's interactions that are with users in the same device cluster.
 * High proportion suggests coordinated in-cluster activity.
 */
async function getInClusterInteractionRatio(userId) {
  const interactions = await getInteractionsForUser(userId);
  if (interactions.length === 0) return 0;
  const cluster = new Set(await getClusterByDevice(userId));
  if (cluster.size === 0) return 0;
  const inCluster = interactions.filter((i) => cluster.has(i.targetId)).length;
  return inCluster / interactions.length;
}

/**
 * Main entry: detect if user belongs to a bot cluster.
 * @param {string|ObjectId} userId
 * @returns {Promise<{ isBotCluster: boolean, signals: string[], rapidCount: number, deviceClusterSize: number, ipClusterSize: number, sameDayCount: number, inClusterRatio?: number }>}
 */
async function detectBotCluster(userId) {
  if (!userId) return { isBotCluster: false, signals: [], rapidCount: 0, deviceClusterSize: 0, ipClusterSize: 0, sameDayCount: 0 };

  const uid = userId.toString?.() || userId;
  const signals = [];

  const [rapidCount, deviceCluster, ipCluster, sameDayCluster, rapidDetected, inClusterRatio] = await Promise.all([
    getRapidInteractionCount(uid),
    getClusterByDevice(uid),
    getClusterByIP(uid),
    getClusterBySameDay(uid),
    detectRapidInteractions(uid),
    getInClusterInteractionRatio(uid),
  ]);

  const deviceClusterSize = deviceCluster.length;
  const ipClusterSize = ipCluster.length;
  const sameDayCount = sameDayCluster.length;

  if (rapidDetected) signals.push('rapid_interactions');
  if (deviceClusterSize >= CLUSTER_SIZE_THRESHOLD) signals.push('same_device_cluster');
  if (ipClusterSize >= CLUSTER_SIZE_THRESHOLD) signals.push('same_ip_cluster');
  if (sameDayCount >= CLUSTER_SIZE_THRESHOLD) signals.push('same_day_signups');
  if (inClusterRatio >= 0.5 && deviceClusterSize >= 2) signals.push('mutual_in_cluster');

  const isBotCluster =
    signals.length >= 2 ||
    (rapidDetected && (deviceClusterSize >= 1 || ipClusterSize >= 1)) ||
    deviceClusterSize >= 10 ||
    ipClusterSize >= 10;

  return {
    isBotCluster: !!isBotCluster,
    signals,
    rapidCount,
    deviceClusterSize,
    ipClusterSize,
    sameDayCount,
    inClusterRatio: Math.round(inClusterRatio * 100) / 100,
  };
}

/**
 * Interaction density: aggregate interactions by source user (follows + likes + comments).
 * Returns [{ userId, count }] sorted by count desc. Optional time window.
 */
async function getInteractionCountsByUser(opts = {}) {
  const windowDays = opts.windowDays ?? INTERACTION_WINDOW_DAYS;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [followCounts, likeCounts, commentCounts] = await Promise.all([
    db.Follow.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$followerId', count: { $sum: 1 } } },
      { $project: { userId: '$_id', count: 1, _id: 0 } },
    ]),
    db.StreamLike.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $project: { userId: '$_id', count: 1, _id: 0 } },
    ]),
    db.StreamComment.aggregate([
      { $match: { createdAt: { $gte: since }, deletedAt: null } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $project: { userId: '$_id', count: 1, _id: 0 } },
    ]),
  ]);

  const byUser = new Map();
  for (const row of followCounts) {
    const uid = String(row.userId);
    byUser.set(uid, (byUser.get(uid) || 0) + row.count);
  }
  for (const row of likeCounts) {
    const uid = String(row.userId);
    byUser.set(uid, (byUser.get(uid) || 0) + row.count);
  }
  for (const row of commentCounts) {
    const uid = String(row.userId);
    byUser.set(uid, (byUser.get(uid) || 0) + row.count);
  }

  return [...byUser.entries()]
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * High-density nodes: users with total interactions (follow + like + comment) above threshold.
 * Simplified cluster detection: filter by count > threshold (e.g. 500).
 */
async function getHighDensityNodes(opts = {}) {
  const threshold = opts.threshold ?? HIGH_DENSITY_THRESHOLD;
  const windowDays = opts.windowDays ?? INTERACTION_WINDOW_DAYS;
  const counts = await getInteractionCountsByUser({ windowDays });
  return counts.filter((i) => i.count > threshold);
}

/**
 * Mutual interaction edges: pairs (u1, u2) that interact in both directions (like each other, follow each other, comment on each other's content).
 * Returns edges with combined weight >= minMutual. Used for interaction density / community detection.
 */
async function getMutualInteractionEdges(opts = {}) {
  const minMutual = opts.minMutual ?? MUTUAL_EDGE_MIN;
  const windowDays = opts.windowDays ?? INTERACTION_WINDOW_DAYS;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const streams = await db.LiveStream.find({}).select('_id userId').lean();
  const streamToOwner = Object.fromEntries(streams.map((s) => [String(s._id), String(s.userId)]));

  const [follows, likes, comments] = await Promise.all([
    db.Follow.find({ createdAt: { $gte: since } }).select('followerId followingId').lean(),
    db.StreamLike.find({ createdAt: { $gte: since } }).select('userId streamId').lean(),
    db.StreamComment.find({ createdAt: { $gte: since }, deletedAt: null }).select('userId streamId').lean(),
  ]);

  const pairWeight = new Map();
  function addEdge(a, b) {
    if (!a || !b || a === b) return;
    const key = [a, b].sort().join(':');
    pairWeight.set(key, (pairWeight.get(key) || 0) + 1);
  }

  for (const f of follows) {
    const a = String(f.followerId);
    const b = String(f.followingId);
    addEdge(a, b);
  }
  for (const l of likes) {
    const a = String(l.userId);
    const b = streamToOwner[l.streamId];
    if (b) addEdge(a, b);
  }
  for (const c of comments) {
    const a = String(c.userId);
    const b = streamToOwner[c.streamId];
    if (b) addEdge(a, b);
  }

  const edges = [];
  for (const [key, weight] of pairWeight) {
    if (weight >= minMutual) {
      const [u1, u2] = key.split(':');
      edges.push({ u1, u2, weight });
    }
  }
  return edges;
}

/**
 * Detect bot farm clusters: high-density nodes + device/IP/same-day clusters + mutual edges.
 * Returns list of candidate cluster summaries (user IDs and signals). Simplified community detection.
 */
async function detectBotFarmClusters(opts = {}) {
  const [highDensity, mutualEdges] = await Promise.all([
    getHighDensityNodes(opts),
    getMutualInteractionEdges(opts),
  ]);

  const maxExpand = opts.maxExpand ?? 100;
  const highDensityLimited = highDensity.slice(0, maxExpand);
  const highDensitySet = new Set(highDensityLimited.map((n) => n.userId));
  const clusters = [];

  for (const node of highDensityLimited) {
    const uid = node.userId;
    const [deviceCluster, ipCluster, sameDay] = await Promise.all([
      getClusterByDevice(uid),
      getClusterByIP(uid),
      getClusterBySameDay(uid, 100),
    ]);
    const allMembers = new Set([uid, ...deviceCluster, ...ipCluster, ...sameDay]);
    const inHighDensity = [...allMembers].filter((m) => highDensitySet.has(m));
    const mutualWith = mutualEdges.filter((e) => e.u1 === uid || e.u2 === uid).map((e) => (e.u1 === uid ? e.u2 : e.u1));
    const combined = new Set([...allMembers, ...mutualWith]);

    if (combined.size >= CLUSTER_SIZE_THRESHOLD || inHighDensity.length >= 2) {
      clusters.push({
        seedUserId: uid,
        interactionCount: node.count,
        memberCount: combined.size,
        deviceClusterSize: deviceCluster.length,
        ipClusterSize: ipCluster.length,
        sameDaySize: sameDay.length,
        highDensityMembers: inHighDensity.length,
        userIds: [...combined].slice(0, 200),
      });
    }
  }

  return clusters;
}

module.exports = {
  detectBotCluster,
  getInteractionsForUser,
  detectRapidInteractions,
  getRapidInteractionCount,
  getClusterByDevice,
  getClusterByIP,
  getClusterBySameDay,
  getInClusterInteractionRatio,
  getInteractionCountsByUser,
  getHighDensityNodes,
  getMutualInteractionEdges,
  detectBotFarmClusters,
};
