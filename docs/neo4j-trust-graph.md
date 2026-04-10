# Neo4j Trust Graph System

The Trust Graph is a graph-based fraud detection system using Neo4j to identify suspicious patterns like gift rings, follow farms, like farms, and multi-account networks.

## Architecture Overview

```
Activity Events (Kafka)
        │
        ▼
┌─────────────────────┐
│  Trust Graph Worker │
│   (Event Ingestion) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│       Neo4j         │
│   (Graph Database)  │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌───────┐   ┌──────────┐
│ Fraud │   │   Admin  │
│Queries│   │Dashboard │
└───────┘   └──────────┘
```

## Quick Start

### 1. Install Neo4j

```bash
# Docker (recommended)
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your-password \
  neo4j:latest

# Or install locally
# Ubuntu: sudo apt install neo4j
# macOS: brew install neo4j
```

### 2. Configure Environment

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-password
```

### 3. Initialize Schema

The schema is auto-initialized on first connection, creating indexes for:
- `User.id`
- `Device.id`
- `IP.address`
- `Payment.id`
- `Content.id`
- `Cluster.id`

## Graph Schema

### Nodes (Entities)

| Node | Properties | Description |
|------|------------|-------------|
| `User` | `id` | Platform user |
| `Device` | `id`, `userAgent` | Device fingerprint |
| `IP` | `address`, `country` | IP address |
| `Payment` | `id`, `amount`, `currency` | Transaction |
| `Content` | `id`, `type` | Video, post, etc. |
| `Cluster` | `id` | Detected fraud cluster |

### Relationships (Edges)

| Relationship | From | To | Properties |
|--------------|------|-----|------------|
| `USES_DEVICE` | User | Device | `lastSeen`, `count` |
| `USES_IP` | User | IP | `lastSeen`, `count` |
| `GIFTED` | User | User | `count`, `totalCoins`, `lastGift` |
| `FOLLOWS` | User | User | `since` |
| `SUBSCRIBED_TO` | User | User | `since`, `tierId` |
| `LIKED` | User | Content | `at` |
| `TRANSACTED` | User | Payment | - |
| `IN_CLUSTER` | User | Cluster | - |

## Fraud Detection Patterns

### 1. Gift Rings

Cyclic gift patterns: A → B → C → A

```cypher
MATCH path = (u:User)-[:GIFTED*3..6]->(u)
RETURN path
```

**Detection**: Users in gift cycles are flagged with `neo4j_gift_ring` signal.

### 2. Follow Circles

Mutual follow farms for engagement manipulation:

```cypher
MATCH (a:User)-[:FOLLOWS]->(b)-[:FOLLOWS]->(c)-[:FOLLOWS]->(a)
WHERE a <> b AND b <> c
RETURN a, b, c
```

**Detection**: Users in follow circles get `neo4j_follow_circle` signal.

### 3. Like Farms

Coordinated liking from same devices:

```cypher
MATCH (c:Content)<-[:LIKED]-(u:User)-[:USES_DEVICE]->(d:Device)<-[:USES_DEVICE]-(other:User)-[:LIKED]->(c)
WHERE u <> other
RETURN c, collect(DISTINCT u)
```

**Detection**: Flagged with `neo4j_like_farm` signal.

### 4. Multi-Account Networks

Multiple accounts sharing devices/IPs:

```cypher
MATCH (d:Device)<-[:USES_DEVICE]-(u:User)
WITH d, collect(u) AS users
WHERE size(users) >= 3
RETURN d, users
```

**Detection**: Flagged with `neo4j_multi_account` signal.

### 5. Creator Self-Funding

Creator receives gifts from accounts sharing their device:

```cypher
MATCH (creator:User)<-[:GIFTED]-(sender:User)-[:USES_DEVICE]->(d:Device)<-[:USES_DEVICE]-(creator)
RETURN creator, collect(sender) AS suspiciousSenders
```

## API Usage

### Recording Relationships

```javascript
const neo4j = require('./services/neo4jClusterService');

// Link user to device
await neo4j.linkUserDevice(userId, deviceFingerprint, { userAgent });

// Link user to IP
await neo4j.linkUserIP(userId, ipAddress, { country });

// Record gift
await neo4j.linkGift(senderId, receiverId, { coins: 100 });

// Record follow
await neo4j.linkFollow(followerId, followingId);

// Record subscription
await neo4j.linkSubscription(subscriberId, creatorId, { tierId: 'premium' });

// Record like
await neo4j.linkLike(userId, contentId, 'video');
```

### Querying Fraud Signals

```javascript
const neo4j = require('./services/neo4jClusterService');

// Get all fraud signals for a user
const signals = await neo4j.getClusterSignals(userId);
// {
//   inGiftRing: false,
//   inFollowCircle: false,
//   inLikeFarm: false,
//   inPaymentCluster: false,
//   inMultiAccountNetwork: true,
//   sharedDeviceCount: 2,
//   sharedIPCount: 1,
//   signals: ['neo4j_multi_account']
// }

// Get creator-specific fraud signals
const creatorSignals = await neo4j.getCreatorFraudGraphSignals(creatorId);
// {
//   selfFundingGifts: true,
//   sharedDeviceGiftSenderCount: 3,
//   subscriptionFarm: false,
//   fakeAuctionBids: false
// }
```

### Detection Queries

```javascript
// Detect gift rings
const rings = await neo4j.runGiftRingDetection();
// { userIds: ['user1', 'user2', 'user3'], count: 3 }

// Detect like farms
const likeFarms = await neo4j.detectLikeFarms({ minLikers: 10 });

// Detect multi-account networks
const networks = await neo4j.detectMultiAccountNetworks({ minAccounts: 3 });
```

### Batch Ingestion

For high-volume event processing:

```javascript
const events = [
  { type: 'login', userId: '123', deviceId: 'fp_abc', ipAddress: '1.2.3.4' },
  { type: 'gift', userId: '123', receiverId: '456', coins: 50 },
  { type: 'follow', userId: '123', receiverId: '789' },
];

const result = await neo4j.batchIngest(events);
// { processed: 3 }
```

### Health Check

```javascript
const health = await neo4j.healthCheck();
// { healthy: true, uri: 'bolt://localhost:7687', initialized: true }

const stats = await neo4j.getGraphStats();
// { users: 10000, devices: 8500, ips: 5000, giftRelationships: 25000, followRelationships: 150000 }
```

## Event Integration

The Trust Graph Worker automatically processes Kafka events:

| Kafka Topic | Events | Graph Action |
|-------------|--------|--------------|
| `auth_events` | `login`, `auth` | Link User→Device, User→IP |
| `payments` | `gift_sent`, `coins.purchased` | Link User→User (GIFTED), User→Payment |
| `user_activity` | `follow`, `unfollow`, `like` | Link/Unlink User→User, User→Content |
| `live_events` | `live.gift` | Link User→User (GIFTED) |

## Admin Dashboard Integration

### Get User Network for Visualization

```javascript
const network = await neo4j.getUserNetwork(userId, depth = 2);
// { nodes: [...], edges: [...] }
```

### Graph Statistics

```javascript
const stats = await neo4j.getGraphStats();
// Display in admin dashboard
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `NEO4J_URI` | - | Neo4j bolt URI (required) |
| `NEO4J_USER` | `neo4j` | Username |
| `NEO4J_PASSWORD` | - | Password (required) |

### Detection Thresholds (in code)

```javascript
CONFIG = {
  GIFT_RING_MIN_CYCLE: 3,        // Minimum cycle length
  FOLLOW_CIRCLE_MIN_CYCLE: 3,   // Minimum circle size
  LIKE_FARM_MIN_LIKES: 50,      // Likes to trigger detection
  MULTI_ACCOUNT_DEVICE_THRESHOLD: 3,  // Accounts per device
  PAYMENT_CLUSTER_MIN_TRANSACTIONS: 5,
}
```

## Best Practices

1. **Initialize schema** on app startup for indexes
2. **Use batch ingestion** for high-volume events
3. **Run detection queries** periodically via cron/worker
4. **Combine with MongoDB** fraud service for comprehensive detection
5. **Monitor graph size** and prune old relationships

## Scaling

For large graphs (>10M nodes):

1. Use Neo4j Enterprise for clustering
2. Implement relationship TTL (prune old edges)
3. Run heavy queries during off-peak hours
4. Consider Graph Data Science (GDS) library for ML-based detection

## Troubleshooting

### Connection Failed
- Check `NEO4J_URI` format: `bolt://host:7687`
- Verify credentials
- Ensure Neo4j is running: `docker logs neo4j`

### Slow Queries
- Verify indexes exist: `SHOW INDEXES`
- Use `EXPLAIN` to analyze query plans
- Consider adding composite indexes

### Memory Issues
- Adjust Neo4j heap: `NEO4J_dbms_memory_heap_max__size=2G`
- Enable page cache: `NEO4J_dbms_memory_pagecache_size=1G`
