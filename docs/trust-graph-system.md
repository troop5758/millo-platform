# Millo Trust Graph System

A graph-based entity linking system for fraud detection, bot detection, and payment abuse prevention.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TRUST GRAPH SYSTEM                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │   Neo4j     │
                              │   Graph DB  │
                              └──────┬──────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Graph Nodes   │      │   Graph Edges   │      │ Fraud Detection │
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ • User          │      │ • USES_DEVICE   │      │ • Gift Rings    │
│ • Device        │      │ • GIFTED        │      │ • Follow Circles│
│ • Payment       │      │ • FOLLOWS       │      │ • Like Farms    │
│ • IP Address    │      │ • PAID          │      │ • Bot Clusters  │
│ • Content       │      │ • COMMENTED     │      │ • Self-Funding  │
│ • Gift          │      │ • PURCHASED     │      │ • Payment Abuse │
│ • Cluster       │      │ • STREAMED      │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## 1. Graph Node Types

### Node Schema

| Node Type | Properties | Description |
|-----------|------------|-------------|
| `User` | `id`, `trustScore`, `riskLevel` | Platform user account |
| `Device` | `id`, `fingerprint`, `ip` | Device fingerprint |
| `IP` | `address`, `reputation` | IP address |
| `Content` | `id`, `type`, `authenticityScore` | Video, stream, post |
| `Payment` | `id`, `amount`, `currency`, `type` | Financial transaction |
| `Gift` | `id`, `senderId`, `receiverId`, `amount` | Live gift transaction |
| `Cluster` | `id`, `type`, `memberCount` | Detected bot cluster |

### Neo4j Node Creation

```cypher
// User node
MERGE (u:User {id: $userId})
SET u.trustScore = $trustScore

// Device node
MERGE (d:Device {id: $deviceId})
SET d.fingerprint = $fingerprint

// Payment node
MERGE (p:Payment {id: $paymentId})
SET p.amount = $amount, p.type = $type
```

---

## 2. Graph Edge Types

### Relationship Schema

| Edge Type | From | To | Description |
|-----------|------|-----|-------------|
| `USES_DEVICE` | User | Device | User logged in from device |
| `GIFTED` | User | User | User sent gift to another |
| `FOLLOWS` | User | User | User follows another |
| `PAID` | User | Payment | User initiated payment |
| `COMMENTED` | User | Content | User commented on content |
| `STREAMED` | User | Content | User watched stream |
| `PURCHASED` | User | Content | User purchased content |
| `IN_CLUSTER` | User | Cluster | User belongs to cluster |
| `SAME_IP` | User | IP | User connected from IP |

### Edge Creation (Cypher)

```cypher
// User → Device relationship
MERGE (u:User {id: $userId})
MERGE (d:Device {id: $device})
MERGE (u)-[:USES_DEVICE]->(d)

// Gift relationship
MERGE (a:User {id: $sender})
MERGE (b:User {id: $receiver})
MERGE (a)-[:GIFTED]->(b)

// Follow relationship
MERGE (a:User {id: $follower})
MERGE (b:User {id: $following})
MERGE (a)-[:FOLLOWS]->(b)
```

---

## 3. Graph Ingestion Worker

File: `packages/api/src/workers/trustGraphWorker.js`

### Event Processing

```javascript
async function processEvent(event) {
  if (!neo4jClusterService.isEnabled()) return;

  const type = event.type ?? event.eventType ?? event.event ?? '';

  // Login → USES_DEVICE
  if (type === 'login' || type === 'auth' || type === 'auth.login') {
    const userId = event.userId ?? event.user_id ?? event.subject;
    const device = event.device ?? event.deviceId ?? event.deviceFingerprint;
    await neo4jClusterService.runCypher(
      `MERGE (u:User {id: $userId})
       MERGE (d:Device {id: $device})
       MERGE (u)-[:USES_DEVICE]->(d)`,
      { userId, device }
    );
  }

  // Gift → GIFTED
  if (type === 'gift' || type === 'gift_sent') {
    const sender = event.sender ?? event.userId;
    const receiver = event.receiver ?? event.receiverId;
    await neo4jClusterService.runCypher(
      `MERGE (a:User {id: $sender})
       MERGE (b:User {id: $receiver})
       MERGE (a)-[:GIFTED]->(b)`,
      { sender, receiver }
    );
  }
}
```

### Kafka Event Handlers

```javascript
function registerKafkaHandlers() {
  // AUTH_EVENTS → Login graph
  kafkaEventBus.addAbuseHandler(kafkaEventBus.TOPICS.AUTH_EVENTS, (payload) =>
    processEvent({ type: 'login', ...payload })
  );

  // PAYMENTS → Gift graph
  kafkaEventBus.addAbuseHandler(kafkaEventBus.TOPICS.PAYMENTS, (payload) => {
    const ev = payload.event ?? payload.eventType ?? '';
    if (ev === 'gift_sent' || ev === 'gift.sent') {
      return processEvent({ type: 'gift_sent', ...payload });
    }
  });
}
```

---

## 4. Fraud Detection Patterns

### 4.1 Gift Ring Detection

Circular gift patterns (A → B → C → A) indicate self-funding fraud.

File: `packages/api/src/services/neo4jClusterService.js`

```cypher
// Detect 3+ node gift rings
MATCH (u:User {id: $userId})-[:GIFTED*3..]->(u)
RETURN count(*) AS c

// List all users in gift rings
MATCH path = (u:User)-[:GIFTED*3..]->(u)
UNWIND nodes(path) AS n
RETURN DISTINCT n.id AS userId
```

**Risk Score Impact**: +50 points

### 4.2 Follow Circle Detection

Mutual follow cycles indicate coordinated follow manipulation.

```cypher
// Detect mutual follow triangle
MATCH (a:User {id: $userId})-[:FOLLOWS]->(b)-[:FOLLOWS]->(c)-[:FOLLOWS]->(a)
RETURN count(*) AS c
```

**Risk Score Impact**: +30 points (engagement cluster)

### 4.3 Device Cluster Detection

Multiple accounts sharing devices indicate bot farms.

```cypher
// Find accounts sharing devices
MATCH (creator:User {id: $creatorId})<-[:GIFTED]-(sender:User)-[:USES_DEVICE]->(d:Device)
WITH d, count(DISTINCT sender) AS senders
WHERE senders >= 2
RETURN max(senders) AS maxSenders
```

**Self-Funding Detection**: If a creator receives gifts from 2+ users who share the same device, this indicates self-funding fraud.

**Risk Score Impact**: +40 points (device cluster), +50 points (self-funding)

### 4.4 Like Farm Detection

Coordinated like behavior across bot accounts.

```javascript
// Signal: neo4j_like_farm
if (cluster.inLikeFarm) {
  score += TRUST_GRAPH_ENGAGEMENT_CLUSTER_RISK; // +30
  signals.push('neo4j_like_farm');
}
```

### 4.5 Payment Cluster Detection

Coordinated payment patterns across linked accounts.

```javascript
// Signal: neo4j_payment_cluster
if (cluster.inPaymentCluster) {
  score += TRUST_GRAPH_PAYMENT_CLUSTER_RISK; // +50
  signals.push('neo4j_payment_cluster');
}
```

---

## 5. Cluster Detection Service

File: `packages/api/src/services/neo4jClusterService.js`

### Get Cluster Signals

```javascript
async function getClusterSignals(userId) {
  return {
    inGiftRing: false,      // User in circular gift pattern
    inFollowCircle: false,  // User in mutual follow cycle
    inLikeFarm: false,      // User in coordinated like cluster
    inPaymentCluster: false,// User in payment abuse cluster
    accountClusterId: null, // Cluster ID if detected
    signals: [],            // Array of signal names
  };
}
```

### Creator Fraud Graph Signals

```javascript
async function getCreatorFraudGraphSignals(creatorId) {
  return {
    selfFundingGifts: false,        // Creator funded by same-device accounts
    sharedDeviceGiftSenderCount: 0, // Count of senders sharing devices
    subscriptionFarm: false,        // Fake subscription pattern
    fakeAuctionBids: false,         // Coordinated auction bidding
  };
}
```

---

## 6. Risk Scoring Integration

File: `packages/api/src/services/riskEngine.js`

### Trust Graph Risk Contributions

| Signal | Score | Description |
|--------|-------|-------------|
| `neo4j_gift_ring` | +50 | User in circular gift pattern |
| `neo4j_account_cluster` | +40 | User in device cluster |
| `neo4j_like_farm` | +30 | User in engagement cluster |
| `neo4j_payment_cluster` | +50 | User in payment abuse cluster |

### Risk Calculation

```javascript
async function calculateRisk(userId) {
  let score = 0;
  const signals = [];

  // Trust Graph signals (Neo4j)
  const neo4jClusterService = require('./neo4jClusterService');
  if (neo4jClusterService.isEnabled()) {
    const cluster = await neo4jClusterService.getClusterSignals(userId);
    
    if (cluster.inGiftRing) {
      score += 50;
      signals.push('neo4j_gift_ring');
    }
    if (cluster.accountClusterId) {
      score += 40;
      signals.push('neo4j_account_cluster');
    }
    if (cluster.inLikeFarm) {
      score += 30;
      signals.push('neo4j_like_farm');
    }
    if (cluster.inPaymentCluster) {
      score += 50;
      signals.push('neo4j_payment_cluster');
    }
  }

  return { score: Math.min(100, score), signals };
}
```

---

## 7. Trust Score System

File: `packages/api/src/services/trustScoreEngine.js`

### Trust Score Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Account Age | 20% | Older accounts more trusted |
| Device Reputation | 20% | Single device = higher trust |
| Behavior Score | 20% | Human-like vs bot-like activity |
| Payment Trust | 20% | Successful payments, no chargebacks |
| Social Graph | 20% | Diverse graph, not in clusters |

### Trust Score Calculation

```javascript
async function gatherSignals(userId) {
  return {
    accountAge: getAccountAgeFactor(user.createdAt),      // 0-100
    deviceReputation: getDeviceReputationFactor(userId),  // 0-100
    behaviorScore: getBehaviorFactor(userId),             // 0-100
    paymentTrust: getPaymentTrustFactor(userId),          // 0-100
    socialGraphScore: getSocialGraphFactor(userId),       // 0-100
    reportScore: getReportPenaltyFactor(userId),          // 0-100 (penalty)
  };
}
```

### Risk Levels

| Score Range | Risk Level | Impact |
|-------------|------------|--------|
| 0–30 | High | Payout hold, manual review |
| 31–60 | Medium | Delayed payouts, monitoring |
| 61–85 | Normal | Standard processing |
| 86–100 | Trusted | Fast-track processing |

---

## 8. Data Models

### DeviceFingerprint

File: `packages/database/src/schemas/DeviceFingerprint.js`

```javascript
{
  fingerprint: String,       // Device unique ID
  userId: ObjectId,          // User ref
  firstSeenAt: Date,
  lastSeenAt: Date,
  ip: String,                // IP address
  userAgent: String,
  visitorId: String,         // FingerprintJS visitor ID
  timezone: String,
  screenResolution: String,
  meta: Mixed,
}
```

### FraudEvent

File: `packages/database/src/schemas/FraudEvent.js`

```javascript
{
  userId: ObjectId,
  eventType: 'payment' | 'login' | 'signup' | 'payout' | 'gift' | 
             'viewer_spike' | 'trend_manipulation' | 'subscription_fraud',
  action: 'allow' | 'review' | 'block',
  riskScore: Number,         // 0-100
  signals: [String],         // Signal names
  provider: 'internal' | 'stripe_radar' | 'sift' | 'riskified',
  ip: String,
  userAgent: String,
  deviceFingerprint: String,
  refType: String,           // 'user', 'content', 'creator', etc.
  refId: String,
  meta: Mixed,
}
```

### PaymentTransaction

File: `packages/database/src/schemas/PaymentTransaction.js`

```javascript
{
  userId: ObjectId,
  creatorId: ObjectId,
  type: 'subscription' | 'ppv' | 'gift' | 'shop_purchase' | 'auction_payment',
  grossAmountCents: Number,
  platformFeeCents: Number,
  creatorAmountCents: Number,
  currency: String,
  paymentProcessor: String,
  status: 'pending' | 'completed' | 'failed' | 'refunded',
}
```

---

## 9. Admin API Endpoints

### Gift Ring Detection

```javascript
// Admin: Detect users in gift rings
GET /admin/moderation/gift-rings

// Response
{
  userIds: ["user_1", "user_2", "user_3"],
  count: 3
}
```

### Cluster Analysis

```javascript
// Admin: Bot cluster detection
GET /dashboards/admin/bot-cluster/:userId

// Response
{
  userId: "...",
  isBotCluster: true,
  signals: ["same_device_cluster", "rapid_interactions"],
  deviceClusterSize: 12,
  ipClusterSize: 8,
  inClusterRatio: 0.72
}
```

---

## 10. Payout Risk Integration

File: `packages/api/src/services/fraudService.js`

### Creator Fraud Score

```javascript
async function getCreatorFraudScore(creatorId) {
  let fraudScore = 0;

  // FraudEvent history
  const [maxUserRisk, chargebackCount] = await Promise.all([...]);
  const chargebackPenalty = Math.min(100, chargebackCount * 40);
  fraudScore = Math.max(maxUserRisk, chargebackPenalty);

  // Neo4j self-funding detection
  const neo4jClusterService = require('./neo4jClusterService');
  if (neo4jClusterService.isEnabled()) {
    const graph = await neo4jClusterService.getCreatorFraudGraphSignals(creatorId);
    if (graph.selfFundingGifts) {
      fraudScore = Math.max(fraudScore, 50); // +50 penalty
    }
  }

  return fraudScore;
}
```

### Payout Hold Tiers

| Fraud Score | Tier | Action |
|-------------|------|--------|
| < 40 | Immediate | Process immediately |
| 40–70 | Delay 24h | Hold for 24 hours |
| > 70 | Manual Review | Admin must approve |

---

## 11. Event Bus Integration

### Topics That Feed Trust Graph

| Topic | Events | Graph Updates |
|-------|--------|---------------|
| `AUTH_EVENTS` | `login`, `signup` | `USES_DEVICE` |
| `PAYMENTS` | `gift_sent`, `purchase` | `GIFTED`, `PAID` |
| `LIVE_EVENTS` | `viewer_join`, `comment` | `STREAMED`, `COMMENTED` |
| `USER_ACTIVITY` | `follow`, `like` | `FOLLOWS`, `LIKED` |

### Event Flow

```
User Action
     │
     ▼
Kafka Event Bus
     │
     ├──► trustGraphWorker.processEvent()
     │         │
     │         ▼
     │    Neo4j Graph Update
     │
     ├──► kafkaAbuseConsumer
     │         │
     │         ▼
     │    riskEngine.calculateRisk()
     │         │
     │         ▼
     │    FraudEvent (if flagged)
     │
     └──► Payout Risk Check
               │
               ▼
          Hold / Allow
```

---

## 12. Configuration

### Environment Variables

```bash
# Neo4j Connection
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Risk Score Thresholds
RISK_TRUST_GRAPH_DEVICE_CLUSTER=40
RISK_TRUST_GRAPH_GIFT_RING=50
RISK_TRUST_GRAPH_ENGAGEMENT_CLUSTER=30
RISK_TRUST_GRAPH_PAYMENT_CLUSTER=50

# Creator Fraud
CREATOR_GRAPH_SELF_FUNDING_PENALTY=50
PAYOUT_RISK_THRESHOLD=80
PAYOUT_HOLD_TIER_IMMEDIATE_MAX=40
PAYOUT_HOLD_TIER_DELAY_MAX=70
```

---

## Summary

### Use Cases

| Use Case | Graph Pattern | Detection Method |
|----------|---------------|------------------|
| Fraud Detection | Gift rings, self-funding | Cypher cycle queries |
| Bot Detection | Device clusters, same-day signups | MongoDB + Neo4j |
| Payment Abuse | Payment clusters, coordinated purchasing | Graph relationships |
| Engagement Manipulation | Follow circles, like farms | Mutual edge patterns |

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Neo4j Service | `neo4jClusterService.js` | Graph queries |
| Trust Graph Worker | `trustGraphWorker.js` | Event ingestion |
| Risk Engine | `riskEngine.js` | Score calculation |
| Trust Score Engine | `trustScoreEngine.js` | Account trust |
| Fraud Service | `fraudService.js` | Payout risk |
| Bot Graph Detection | `botGraphDetection.js` | MongoDB fallback |
