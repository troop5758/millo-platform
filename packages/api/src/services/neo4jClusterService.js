'use strict';
/**
 * Neo4j Trust Graph Service — comprehensive fraud detection via graph analysis.
 * Entities: User, Device, IP, Payment, Content
 * Relationships: USES_DEVICE, USES_IP, GIFTED, FOLLOWS, SUBSCRIBED_TO, TRANSACTED, LIKED, VIEWED
 * Detects: gift rings, follow circles, like farms, payment clusters, multi-account networks.
 * https://milloapp.com
 */

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || '';

// Configuration
const CONFIG = {
  // Detection thresholds
  GIFT_RING_MIN_CYCLE: 3,
  FOLLOW_CIRCLE_MIN_CYCLE: 3,
  LIKE_FARM_MIN_LIKES: 50,
  LIKE_FARM_TIME_WINDOW_MS: 3600000, // 1 hour
  MULTI_ACCOUNT_DEVICE_THRESHOLD: 3,
  PAYMENT_CLUSTER_MIN_TRANSACTIONS: 5,
  // Batch processing
  BATCH_SIZE: 100,
  // Session timeout
  SESSION_TIMEOUT_MS: 30000,
};

let _driver = null;
let _initialized = false;

function isEnabled() {
  return Boolean(NEO4J_URI && NEO4J_PASSWORD);
}

async function getDriver() {
  if (!isEnabled()) return null;
  if (_driver) return _driver;
  try {
    const neo4j = require('neo4j-driver');
    if (!neo4j?.driver) return null;
    _driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 10000,
    });
    await _driver.verifyConnectivity();
    return _driver;
  } catch (err) {
    _driver = null;
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[neo4j] connect failed:', err?.message);
    }
    return null;
  }
}

/**
 * Initialize graph schema (indexes and constraints).
 */
async function initializeSchema() {
  if (!isEnabled() || _initialized) return { ok: false };
  const driver = await getDriver();
  if (!driver) return { ok: false };

  const session = driver.session();
  try {
    // Create indexes for fast lookups
    const indexes = [
      'CREATE INDEX user_id_idx IF NOT EXISTS FOR (u:User) ON (u.id)',
      'CREATE INDEX device_id_idx IF NOT EXISTS FOR (d:Device) ON (d.id)',
      'CREATE INDEX ip_address_idx IF NOT EXISTS FOR (i:IP) ON (i.address)',
      'CREATE INDEX payment_id_idx IF NOT EXISTS FOR (p:Payment) ON (p.id)',
      'CREATE INDEX content_id_idx IF NOT EXISTS FOR (c:Content) ON (c.id)',
      'CREATE INDEX cluster_id_idx IF NOT EXISTS FOR (cl:Cluster) ON (cl.id)',
    ];

    for (const idx of indexes) {
      await session.run(idx).catch(() => {});
    }

    _initialized = true;
    console.info('[neo4j] Schema initialized');
    return { ok: true };
  } catch (err) {
    console.warn('[neo4j] initializeSchema error:', err?.message);
    return { ok: false, error: err?.message };
  } finally {
    await session.close();
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  GRAPH ENTITY LINKING — Record relationships for fraud analysis
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Link user to device fingerprint.
 */
async function linkUserDevice(userId, deviceId, meta = {}) {
  if (!userId || !deviceId || !isEnabled()) return null;
  const loginRisk = meta.loginRisk != null && Number.isFinite(Number(meta.loginRisk)) ? Number(meta.loginRisk) : null;
  return runCypher(
    `MERGE (u:User {id: $userId})
     MERGE (d:Device {id: $deviceId})
     MERGE (u)-[r:USES_DEVICE]->(d)
     SET r.lastSeen = datetime(), r.count = coalesce(r.count, 0) + 1
     SET r.lastLoginRisk = coalesce($loginRisk, r.lastLoginRisk)
     SET d.userAgent = coalesce($userAgent, d.userAgent)
     RETURN u, d`,
    {
      userId: String(userId),
      deviceId: String(deviceId),
      userAgent: meta.userAgent || null,
      loginRisk,
    }
  );
}

/**
 * Link user to IP address.
 */
async function linkUserIP(userId, ipAddress, meta = {}) {
  if (!userId || !ipAddress || !isEnabled()) return null;
  return runCypher(
    `MERGE (u:User {id: $userId})
     MERGE (i:IP {address: $ipAddress})
     MERGE (u)-[r:USES_IP]->(i)
     SET r.lastSeen = datetime(), r.count = coalesce(r.count, 0) + 1
     SET i.country = coalesce($country, i.country)
     RETURN u, i`,
    { userId: String(userId), ipAddress: String(ipAddress), country: meta.country || null }
  );
}

/**
 * Record a gift transaction in the graph.
 */
async function linkGift(senderId, receiverId, meta = {}) {
  if (!senderId || !receiverId || !isEnabled()) return null;
  return runCypher(
    `MERGE (sender:User {id: $senderId})
     MERGE (receiver:User {id: $receiverId})
     MERGE (sender)-[r:GIFTED]->(receiver)
     SET r.lastGift = datetime(), r.count = coalesce(r.count, 0) + 1
     SET r.totalCoins = coalesce(r.totalCoins, 0) + $coins
     RETURN sender, receiver`,
    { senderId: String(senderId), receiverId: String(receiverId), coins: meta.coins || 0 }
  );
}

/**
 * Record a follow relationship.
 */
async function linkFollow(followerId, followingId) {
  if (!followerId || !followingId || !isEnabled()) return null;
  return runCypher(
    `MERGE (a:User {id: $followerId})
     MERGE (b:User {id: $followingId})
     MERGE (a)-[r:FOLLOWS]->(b)
     SET r.since = coalesce(r.since, datetime())
     RETURN a, b`,
    { followerId: String(followerId), followingId: String(followingId) }
  );
}

/**
 * Record an unfollow (remove relationship).
 */
async function unlinkFollow(followerId, followingId) {
  if (!followerId || !followingId || !isEnabled()) return null;
  return runCypher(
    `MATCH (a:User {id: $followerId})-[r:FOLLOWS]->(b:User {id: $followingId})
     DELETE r`,
    { followerId: String(followerId), followingId: String(followingId) }
  );
}

/**
 * Record a subscription.
 */
async function linkSubscription(subscriberId, creatorId, meta = {}) {
  if (!subscriberId || !creatorId || !isEnabled()) return null;
  return runCypher(
    `MERGE (sub:User {id: $subscriberId})
     MERGE (creator:User {id: $creatorId})
     MERGE (sub)-[r:SUBSCRIBED_TO]->(creator)
     SET r.since = coalesce(r.since, datetime())
     SET r.tierId = coalesce($tierId, r.tierId)
     RETURN sub, creator`,
    { subscriberId: String(subscriberId), creatorId: String(creatorId), tierId: meta.tierId || null }
  );
}

/**
 * Record a like on content.
 */
async function linkLike(userId, contentId, contentType = 'video') {
  if (!userId || !contentId || !isEnabled()) return null;
  return runCypher(
    `MERGE (u:User {id: $userId})
     MERGE (c:Content {id: $contentId, type: $contentType})
     MERGE (u)-[r:LIKED]->(c)
     SET r.at = datetime()
     RETURN u, c`,
    { userId: String(userId), contentId: String(contentId), contentType }
  );
}

/**
 * Record a payment transaction.
 */
async function linkPayment(userId, paymentId, meta = {}) {
  if (!userId || !paymentId || !isEnabled()) return null;
  return runCypher(
    `MERGE (u:User {id: $userId})
     MERGE (p:Payment {id: $paymentId})
     MERGE (u)-[r:TRANSACTED]->(p)
     SET p.amount = $amount, p.currency = $currency, p.at = datetime()
     RETURN u, p`,
    {
      userId: String(userId),
      paymentId: String(paymentId),
      amount: meta.amount || 0,
      currency: meta.currency || 'USD',
    }
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  FRAUD DETECTION QUERIES
 * ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Get cluster/risk signals for a user from Neo4j.
 * Detects: gift rings, follow circles, like farms, payment clusters, multi-account networks.
 */
async function getClusterSignals(userId) {
  const empty = {
    inGiftRing: false,
    inFollowCircle: false,
    inLikeFarm: false,
    inPaymentCluster: false,
    inMultiAccountNetwork: false,
    sharedDeviceCount: 0,
    sharedIPCount: 0,
    accountClusterId: null,
    signals: [],
  };

  if (!userId || !isEnabled()) return empty;
  const driver = await getDriver();
  if (!driver) return empty;

  const uid = String(userId);
  const signals = [];
  const result = { ...empty };

  const session = driver.session();
  try {
    // 1. Gift ring detection (A→B→C→A cycle)
    const giftRingResult = await session.run(
      `MATCH path = (u:User {id: $userId})-[:GIFTED*${CONFIG.GIFT_RING_MIN_CYCLE}..6]->(u)
       RETURN count(path) AS cycles LIMIT 1`,
      { userId: uid }
    );
    result.inGiftRing = (giftRingResult.records[0]?.get('cycles')?.toNumber?.() || 0) > 0;
    if (result.inGiftRing) signals.push('neo4j_gift_ring');

    // 2. Follow circle detection (mutual follow farms)
    const followCircleResult = await session.run(
      `MATCH (a:User {id: $userId})-[:FOLLOWS]->(b)-[:FOLLOWS]->(c)-[:FOLLOWS]->(a)
       WHERE a <> b AND b <> c AND a <> c
       RETURN count(*) AS cycles LIMIT 1`,
      { userId: uid }
    );
    result.inFollowCircle = (followCircleResult.records[0]?.get('cycles')?.toNumber?.() || 0) > 0;
    if (result.inFollowCircle) signals.push('neo4j_follow_circle');

    // 3. Like farm detection (user likes many items in short time, or part of like cluster)
    const likeFarmResult = await session.run(
      `MATCH (u:User {id: $userId})-[:LIKED]->(c:Content)
       WITH u, count(c) AS likeCount
       WHERE likeCount > $threshold
       RETURN likeCount`,
      { userId: uid, threshold: CONFIG.LIKE_FARM_MIN_LIKES }
    );
    result.inLikeFarm = likeFarmResult.records.length > 0;
    if (result.inLikeFarm) signals.push('neo4j_like_farm');

    // 4. Multi-account network (users sharing same device)
    const multiAccountResult = await session.run(
      `MATCH (u:User {id: $userId})-[:USES_DEVICE]->(d:Device)<-[:USES_DEVICE]-(other:User)
       WHERE u <> other
       RETURN count(DISTINCT other) AS otherUsers, count(DISTINCT d) AS sharedDevices`,
      { userId: uid }
    );
    const otherUsers = multiAccountResult.records[0]?.get('otherUsers')?.toNumber?.() || 0;
    result.sharedDeviceCount = multiAccountResult.records[0]?.get('sharedDevices')?.toNumber?.() || 0;
    result.inMultiAccountNetwork = otherUsers >= CONFIG.MULTI_ACCOUNT_DEVICE_THRESHOLD;
    if (result.inMultiAccountNetwork) signals.push('neo4j_multi_account');

    // 5. Shared IP detection
    const sharedIPResult = await session.run(
      `MATCH (u:User {id: $userId})-[:USES_IP]->(i:IP)<-[:USES_IP]-(other:User)
       WHERE u <> other
       RETURN count(DISTINCT i) AS sharedIPs`,
      { userId: uid }
    );
    result.sharedIPCount = sharedIPResult.records[0]?.get('sharedIPs')?.toNumber?.() || 0;
    if (result.sharedIPCount > 2) signals.push('neo4j_shared_ip');

    // 6. Payment cluster detection
    const paymentClusterResult = await session.run(
      `MATCH (u:User {id: $userId})-[:TRANSACTED]->(p:Payment)
       WITH u, count(p) AS txCount
       WHERE txCount > $threshold
       RETURN txCount`,
      { userId: uid, threshold: CONFIG.PAYMENT_CLUSTER_MIN_TRANSACTIONS }
    );
    result.inPaymentCluster = paymentClusterResult.records.length > 0;
    if (result.inPaymentCluster) signals.push('neo4j_payment_cluster');

    // 7. Account cluster membership
    const clusterResult = await session.run(
      `MATCH (u:User {id: $userId})-[:IN_CLUSTER]->(cl:Cluster)
       RETURN cl.id AS clusterId LIMIT 1`,
      { userId: uid }
    );
    result.accountClusterId = clusterResult.records[0]?.get('clusterId') ?? null;
    if (result.accountClusterId) signals.push('neo4j_account_cluster');

    result.signals = signals;
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[neo4j] getClusterSignals error:', err?.message);
    }
  } finally {
    await session.close();
  }

  return result;
}

/**
 * Graph-based creator fraud signals: fake gifts (self-funding), subscription farms, self-purchases, fake auction bids.
 * Example: Creator A receives gifts from B,C,D and B,C,D all share a device → self-funding fraud.
 * @param {string|ObjectId} creatorId
 * @returns {{ selfFundingGifts: boolean, sharedDeviceGiftSenderCount: number, subscriptionFarm: boolean, fakeAuctionBids: boolean }}
 */
async function getCreatorFraudGraphSignals(creatorId) {
  const out = {
    selfFundingGifts: false,
    sharedDeviceGiftSenderCount: 0,
    subscriptionFarm: false,
    fakeAuctionBids: false,
  };
  if (!creatorId || !isEnabled()) return out;
  const driver = await getDriver();
  if (!driver) return out;
  const cid = (creatorId?.toString?.() || creatorId).toString();
  try {
    const session = driver.session();
    try {
      // Creator receives gifts from 2+ users who share the same device → self-funding fraud
      const selfFund = await session.run(
        `MATCH (creator:User {id: $creatorId})<-[:GIFTED]-(sender:User)-[:USES_DEVICE]->(d:Device)
         WITH d, count(DISTINCT sender) AS senders
         WHERE senders >= 2
         RETURN max(senders) AS maxSenders`,
        { creatorId: cid }
      );
      const maxSenders = selfFund.records[0]?.get('maxSenders')?.toNumber?.() ?? 0;
      out.selfFundingGifts = maxSenders >= 2;
      out.sharedDeviceGiftSenderCount = maxSenders;
    } finally {
      await session.close();
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[neo4j] getCreatorFraudGraphSignals error:', err?.message);
    }
  }
  return out;
}

/**
 * Run gift-ring detection and return list of user IDs in rings (for admin).
 * No-op when Neo4j disabled.
 */
async function runGiftRingDetection(opts = {}) {
  if (!isEnabled()) return { userIds: [], count: 0 };
  const driver = await getDriver();
  if (!driver) return { userIds: [], count: 0 };
  try {
    const session = driver.session();
    try {
      const result = await session.run(
        `MATCH path = (u:User)-[:GIFTED*3..]->(u)
         UNWIND nodes(path) AS n
         RETURN DISTINCT n.id AS userId`
      );
      const userIds = result.records.map((r) => r.get('userId')).filter(Boolean);
      return { userIds, count: userIds.length };
    } finally {
      await session.close();
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[neo4j] runGiftRingDetection error:', err?.message);
    }
    return { userIds: [], count: 0 };
  }
}

/**
 * Run a Cypher query with parameters (for Graph Ingestion Worker and other writers).
 * No-op when Neo4j disabled. Returns { summary } or null.
 */
async function runCypher(cypher, params = {}) {
  if (!isEnabled()) return null;
  const driver = await getDriver();
  if (!driver) return null;
  try {
    const session = driver.session();
    try {
      const result = await session.run(cypher, params);
      return { summary: result.summary };
    } finally {
      await session.close();
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[neo4j] runCypher error:', err?.message);
    }
    return null;
  }
}

/**
 * Detect like farms — accounts that like the same content in coordinated patterns.
 */
async function detectLikeFarms(opts = {}) {
  if (!isEnabled()) return { clusters: [], count: 0 };
  const driver = await getDriver();
  if (!driver) return { clusters: [], count: 0 };

  const minLikers = opts.minLikers || 10;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (c:Content)<-[:LIKED]-(u:User)
       WITH c, collect(DISTINCT u.id) AS likers, count(DISTINCT u) AS likerCount
       WHERE likerCount >= $minLikers
       MATCH (u1:User)-[:USES_DEVICE]->(d:Device)<-[:USES_DEVICE]-(u2:User)
       WHERE u1.id IN likers AND u2.id IN likers AND u1 <> u2
       RETURN c.id AS contentId, collect(DISTINCT u1.id) AS suspiciousLikers
       LIMIT 100`,
      { minLikers }
    );

    const clusters = result.records.map((r) => ({
      contentId: r.get('contentId'),
      suspiciousLikers: r.get('suspiciousLikers'),
    }));

    return { clusters, count: clusters.length };
  } catch (err) {
    console.warn('[neo4j] detectLikeFarms error:', err?.message);
    return { clusters: [], count: 0 };
  } finally {
    await session.close();
  }
}

/**
 * Detect multi-account networks — users sharing devices or IPs.
 */
async function detectMultiAccountNetworks(opts = {}) {
  if (!isEnabled()) return { networks: [], count: 0 };
  const driver = await getDriver();
  if (!driver) return { networks: [], count: 0 };

  const minAccounts = opts.minAccounts || CONFIG.MULTI_ACCOUNT_DEVICE_THRESHOLD;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (d:Device)<-[:USES_DEVICE]-(u:User)
       WITH d, collect(DISTINCT u.id) AS users, count(DISTINCT u) AS userCount
       WHERE userCount >= $minAccounts
       RETURN d.id AS deviceId, users, userCount
       ORDER BY userCount DESC
       LIMIT 100`,
      { minAccounts }
    );

    const networks = result.records.map((r) => ({
      deviceId: r.get('deviceId'),
      users: r.get('users'),
      userCount: r.get('userCount')?.toNumber?.() || 0,
    }));

    return { networks, count: networks.length };
  } catch (err) {
    console.warn('[neo4j] detectMultiAccountNetworks error:', err?.message);
    return { networks: [], count: 0 };
  } finally {
    await session.close();
  }
}

/**
 * Get user's connected network for visualization.
 */
async function getUserNetwork(userId, depth = 2) {
  if (!userId || !isEnabled()) return { nodes: [], edges: [] };
  const driver = await getDriver();
  if (!driver) return { nodes: [], edges: [] };

  const uid = String(userId);
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH path = (u:User {id: $userId})-[*1..${Math.min(depth, 3)}]-(connected)
       WITH nodes(path) AS nodes, relationships(path) AS rels
       UNWIND nodes AS n
       WITH collect(DISTINCT {id: n.id, labels: labels(n)}) AS nodeList,
            collect(DISTINCT rels) AS relList
       RETURN nodeList, relList`,
      { userId: uid }
    );

    const nodes = result.records[0]?.get('nodeList') || [];
    const edges = [];

    // Extract edges from relationships
    const relList = result.records[0]?.get('relList') || [];
    for (const rels of relList) {
      if (Array.isArray(rels)) {
        for (const r of rels) {
          edges.push({
            type: r.type,
            from: r.start?.properties?.id,
            to: r.end?.properties?.id,
          });
        }
      }
    }

    return { nodes, edges };
  } catch (err) {
    console.warn('[neo4j] getUserNetwork error:', err?.message);
    return { nodes: [], edges: [] };
  } finally {
    await session.close();
  }
}

/**
 * Batch process events for graph ingestion.
 */
async function batchIngest(events = []) {
  if (!isEnabled() || !events.length) return { processed: 0 };
  const driver = await getDriver();
  if (!driver) return { processed: 0 };

  let processed = 0;
  const session = driver.session();
  try {
    const tx = session.beginTransaction();

    for (const event of events) {
      const { type, userId, deviceId, ipAddress, receiverId, contentId, paymentId, meta } = event;

      try {
        switch (type) {
          case 'login':
          case 'device':
            if (userId && deviceId) {
              await tx.run(
                `MERGE (u:User {id: $userId})
                 MERGE (d:Device {id: $deviceId})
                 MERGE (u)-[r:USES_DEVICE]->(d)
                 SET r.lastSeen = datetime()`,
                { userId: String(userId), deviceId: String(deviceId) }
              );
              processed++;
            }
            if (userId && ipAddress) {
              await tx.run(
                `MERGE (u:User {id: $userId})
                 MERGE (i:IP {address: $ipAddress})
                 MERGE (u)-[r:USES_IP]->(i)
                 SET r.lastSeen = datetime()`,
                { userId: String(userId), ipAddress: String(ipAddress) }
              );
              processed++;
            }
            break;

          case 'gift':
            if (userId && receiverId) {
              await tx.run(
                `MERGE (s:User {id: $senderId})
                 MERGE (r:User {id: $receiverId})
                 MERGE (s)-[rel:GIFTED]->(r)
                 SET rel.count = coalesce(rel.count, 0) + 1`,
                { senderId: String(userId), receiverId: String(receiverId) }
              );
              processed++;
            }
            break;

          case 'follow':
            if (userId && receiverId) {
              await tx.run(
                `MERGE (a:User {id: $followerId})
                 MERGE (b:User {id: $followingId})
                 MERGE (a)-[:FOLLOWS]->(b)`,
                { followerId: String(userId), followingId: String(receiverId) }
              );
              processed++;
            }
            break;

          case 'like':
            if (userId && contentId) {
              await tx.run(
                `MERGE (u:User {id: $userId})
                 MERGE (c:Content {id: $contentId})
                 MERGE (u)-[:LIKED]->(c)`,
                { userId: String(userId), contentId: String(contentId) }
              );
              processed++;
            }
            break;

          case 'payment':
            if (userId && paymentId) {
              await tx.run(
                `MERGE (u:User {id: $userId})
                 MERGE (p:Payment {id: $paymentId})
                 MERGE (u)-[:TRANSACTED]->(p)
                 SET p.amount = $amount`,
                { userId: String(userId), paymentId: String(paymentId), amount: meta?.amount || 0 }
              );
              processed++;
            }
            break;
        }
      } catch (e) {
        // Continue processing other events
      }
    }

    await tx.commit();
  } catch (err) {
    console.warn('[neo4j] batchIngest error:', err?.message);
  } finally {
    await session.close();
  }

  return { processed };
}

/**
 * Health check for Neo4j connection.
 */
async function healthCheck() {
  if (!isEnabled()) {
    return { healthy: true, reason: 'NEO4J_DISABLED' };
  }

  try {
    const driver = await getDriver();
    if (!driver) {
      return { healthy: false, reason: 'DRIVER_NOT_CONNECTED' };
    }

    const session = driver.session();
    try {
      const result = await session.run('RETURN 1 AS health');
      const health = result.records[0]?.get('health')?.toNumber?.();
      return {
        healthy: health === 1,
        uri: NEO4J_URI,
        initialized: _initialized,
      };
    } finally {
      await session.close();
    }
  } catch (err) {
    return { healthy: false, error: err?.message };
  }
}

/**
 * Get graph statistics for admin dashboard.
 */
async function getGraphStats() {
  if (!isEnabled()) return null;
  const driver = await getDriver();
  if (!driver) return null;

  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User) WITH count(u) AS users
       MATCH (d:Device) WITH users, count(d) AS devices
       MATCH (i:IP) WITH users, devices, count(i) AS ips
       MATCH ()-[r:GIFTED]->() WITH users, devices, ips, count(r) AS gifts
       MATCH ()-[f:FOLLOWS]->() WITH users, devices, ips, gifts, count(f) AS follows
       RETURN users, devices, ips, gifts, follows`
    );

    const record = result.records[0];
    return {
      users: record?.get('users')?.toNumber?.() || 0,
      devices: record?.get('devices')?.toNumber?.() || 0,
      ips: record?.get('ips')?.toNumber?.() || 0,
      giftRelationships: record?.get('gifts')?.toNumber?.() || 0,
      followRelationships: record?.get('follows')?.toNumber?.() || 0,
    };
  } catch (err) {
    console.warn('[neo4j] getGraphStats error:', err?.message);
    return null;
  } finally {
    await session.close();
  }
}

async function close() {
  if (_driver) {
    try {
      await _driver.close();
    } catch (_) {}
    _driver = null;
    _initialized = false;
  }
}

module.exports = {
  // Configuration
  CONFIG,
  isEnabled,
  getDriver,
  initializeSchema,

  // Entity linking
  linkUserDevice,
  linkUserIP,
  linkGift,
  linkFollow,
  unlinkFollow,
  linkSubscription,
  linkLike,
  linkPayment,

  // Fraud detection
  getClusterSignals,
  getCreatorFraudGraphSignals,
  runGiftRingDetection,
  detectLikeFarms,
  detectMultiAccountNetworks,

  // Visualization
  getUserNetwork,
  getGraphStats,

  // Batch processing
  batchIngest,

  // Utilities
  runCypher,
  healthCheck,
  close,
};
