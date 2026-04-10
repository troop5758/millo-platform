# Millo Event Driven Infrastructure

Kafka/RabbitMQ-based event streaming for decoupled, scalable processing.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EVENT DRIVEN INFRASTRUCTURE                            │
└─────────────────────────────────────────────────────────────────────────────┘

                              PRODUCERS
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│   Auth     │ │  Payments  │ │    Live    │ │ Moderation │ │  Content   │
│  Service   │ │  Service   │ │  Service   │ │  Service   │ │  Service   │
└─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
      │              │              │              │              │
      ▼              ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MESSAGE BROKER                                      │
│                    (Kafka / RabbitMQ)                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  TOPICS:                                                                    │
│  • payments        • live_events       • moderation       • notifications   │
│  • analytics       • fraud             • user_activity    • auth_events     │
└─────────────────────────────────────────────────────────────────────────────┘
      │              │              │              │              │
      ▼              ▼              ▼              ▼              ▼
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ Analytics  │ │   Fraud    │ │Notifications│ │ Moderation │ │   Trust    │
│ Consumer   │ │ Detection  │ │  Consumer   │ │  Consumer  │ │   Graph    │
└────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘
                              CONSUMERS
```

---

## 1. Event Bus Configuration

### Unified Event Bus

File: `packages/api/src/services/eventBus.js`

```javascript
const TOPICS = Object.freeze({
  PAYMENTS: 'payments',
  LIVE_EVENTS: 'live_events',
  MODERATION: 'moderation',
  MODERATION_EVENTS: 'moderation_events',
  NOTIFICATIONS: 'notifications',
  ANALYTICS: 'analytics',
  FRAUD: 'fraud',
  USER_ACTIVITY: 'user_activity',
  AUTH_EVENTS: 'auth_events',
});

// Auto-select backend based on env
function getBackend() {
  if (process.env.EVENT_BUS === 'rabbitmq' && process.env.RABBITMQ_URL)
    return require('./rabbitmqEventBus');
  return require('./kafkaEventBus');
}

// Publish event
async function produce(topic, payload = {}) {
  const backend = getBackend();
  return backend.publish(topic, payload);
}
```

### Kafka Backend

File: `packages/api/src/services/kafkaEventBus.js`

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'millo-api',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const producer = kafka.producer({ allowAutoTopicCreation: true });

async function publish(topic, event = {}) {
  const payload = {
    ts: new Date().toISOString(),
    ...event,
  };
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(payload) }],
  });
}
```

### RabbitMQ Backend

File: `packages/api/src/services/rabbitmqEventBus.js`

```javascript
const amqp = require('amqplib');

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'millo_events';

async function publish(topic, event = {}) {
  const channel = await getChannel();
  const payload = { ts: new Date().toISOString(), ...event };
  channel.publish(
    EXCHANGE,
    topic,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true }
  );
}
```

---

## 2. Topics & Events

### Topic Reference

| Topic | Description | Example Events |
|-------|-------------|----------------|
| `payments` | Financial transactions | `coins.purchased`, `payout.requested`, `gift.sent` |
| `live_events` | Live streaming activity | `viewer.join`, `viewer.leave`, `cohost.invite` |
| `moderation` | Content moderation | `report.created`, `report.action` |
| `notifications` | User notifications | `notification.created` |
| `analytics` | Analytics events | `activity.logged` |
| `fraud` | Fraud detection | `fraud.detected`, `risk.elevated` |
| `user_activity` | User behavior | `behavior`, `activity.logged` |
| `auth_events` | Authentication | `login.success`, `login.failed` |

### Event Payloads

#### Authentication Events (`auth_events`)
```javascript
// Login success
kafka.publish(TOPICS.AUTH_EVENTS, {
  event: 'login.success',
  userId: '...',
  ip: '...',
  deviceFingerprint: '...',
  userAgent: '...',
  method: 'password' | 'oauth' | 'magic_link',
});
```

#### Payment Events (`payments`)
```javascript
// Coin purchase
kafka.publish(TOPICS.PAYMENTS, {
  event: 'coins.purchased',
  userId: '...',
  amountCents: 999,
  coins: 100,
  packId: 'pack_100',
});

// Gift sent
kafka.publish(TOPICS.PAYMENTS, {
  event: 'gift.sent',
  userId: '...',
  receiverId: '...',
  streamId: '...',
  giftId: '...',
  cost: 50,
});

// Payout requested
kafka.publish(TOPICS.PAYMENTS, {
  event: 'payout.requested',
  userId: '...',
  amountCents: 10000,
  provider: 'stripe',
});
```

#### Live Stream Events (`live_events`)
```javascript
// Viewer join
kafka.publish(TOPICS.LIVE_EVENTS, {
  event: 'viewer.join',
  streamId: '...',
  userId: '...',
  viewerCount: 150,
});

// Viewer leave
kafka.publish(TOPICS.LIVE_EVENTS, {
  event: 'viewer.leave',
  streamId: '...',
  userId: '...',
  viewerCount: 149,
});

// Co-host invite
kafka.publish(TOPICS.LIVE_EVENTS, {
  event: 'cohost.invite',
  streamId: '...',
  inviterId: '...',
  invitedUserId: '...',
});
```

#### Moderation Events (`moderation`)
```javascript
// Report created
kafka.publish(TOPICS.MODERATION, {
  event: 'report.created',
  reportId: '...',
  reporterId: '...',
  targetType: 'stream' | 'user' | 'comment',
  targetId: '...',
});

// Report action taken
kafka.publish(TOPICS.MODERATION, {
  event: 'report.action',
  reportId: '...',
  action: 'warn' | 'suspend' | 'ban' | 'dismiss',
  moderatorId: '...',
});
```

#### User Activity Events (`user_activity`)
```javascript
// Activity logged
kafka.publish(TOPICS.USER_ACTIVITY, {
  event: 'activity.logged',
  userId: '...',
  activityType: 'follow' | 'video_upload' | 'purchase' | 'gift_sent' | 'live_started',
  referenceId: '...',
});

// Behavior event
kafka.publish(TOPICS.USER_ACTIVITY, {
  event: 'behavior',
  userId: '...',
  eventType: 'scroll' | 'like' | 'comment' | 'share',
});
```

---

## 3. Producers (Event Sources)

### Producer Locations

| Source File | Topic | Events |
|-------------|-------|--------|
| `routes/auth.js` | `auth_events` | `login.success` |
| `routes/payments.js` | `payments` | `coins.purchased`, `payout.requested` |
| `routes/live.js` | `live_events` | `viewer.join`, `viewer.leave`, `cohost.*` |
| `routes/moderation.js` | `moderation` | `report.created`, `report.action` |
| `routes/content.js` | `payments` | `gift.sent` |
| `routes/security.js` | `user_activity` | `behavior` |
| `lib/activityService.js` | `analytics`, `user_activity` | `activity.logged` |
| `lib/notifyUser.js` | `notifications` | `notification.created` |

### Example Producer Code

```javascript
// routes/payments.js
const kafka = require('../services/kafkaEventBus');

// After successful coin purchase
kafka.publish(kafka.TOPICS.PAYMENTS, {
  event: 'coins.purchased',
  userId: String(user._id),
  amountCents,
  coins,
  packId,
});

// routes/live.js
// On viewer join
kafka.publish(kafka.TOPICS.LIVE_EVENTS, {
  event: 'viewer.join',
  streamId: String(streamId),
  userId: String(user._id),
  viewerCount: count,
});
```

---

## 4. Consumers (Event Handlers)

### Consumer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      KAFKA CONSUMERS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Abuse Detection Consumer                       │   │
│  │  Group: millo-abuse-consumer                             │   │
│  │  Topics: user_activity, auth_events, payments,           │   │
│  │          live_events, moderation, moderation_events      │   │
│  │  Handlers:                                               │   │
│  │    • runBehaviorAnalysis (user_activity)                 │   │
│  │    • detectATO (auth_events)                             │   │
│  │    • detectGiftFraud (payments)                          │   │
│  │    • detectLiveAbuse (live_events)                       │   │
│  │    • handleModerationEvent (moderation)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Analytics Consumer                             │   │
│  │  Group: millo-analytics-consumer                         │   │
│  │  Topics: analytics, payments, live_events                │   │
│  │  Handler: Persist to EventBusLog                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Notifications Consumer                         │   │
│  │  Group: millo-notifications-consumer                     │   │
│  │  Topics: notifications                                   │   │
│  │  Handler: Send push/email via notifyUser                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Abuse Detection Consumer

File: `packages/api/src/workers/kafkaAbuseConsumer.js`

```javascript
const kafka = require('../services/kafkaEventBus');
const {
  runBehaviorAnalysis,
  detectATO,
  detectGiftFraud,
  detectLiveAbuse,
  handleModerationEvent,
} = require('../services/kafkaAbuseHandlers');

function registerHandlers() {
  kafka.addAbuseHandler(TOPICS.USER_ACTIVITY, runBehaviorAnalysis);
  kafka.addAbuseHandler(TOPICS.AUTH_EVENTS, detectATO);
  kafka.addAbuseHandler(TOPICS.PAYMENTS, detectGiftFraud);
  kafka.addAbuseHandler(TOPICS.LIVE_EVENTS, detectLiveAbuse);
  kafka.addAbuseHandler(TOPICS.MODERATION, handleModerationEvent);
}
```

### Abuse Handlers

File: `packages/api/src/services/kafkaAbuseHandlers.js`

| Handler | Topic | Action |
|---------|-------|--------|
| `runBehaviorAnalysis` | `user_activity` | Queue bot detection job |
| `detectATO` | `auth_events` | Check account takeover via geo/device |
| `detectGiftFraud` | `payments` | Evaluate gift fraud risk score |
| `detectLiveAbuse` | `live_events` | Detect viewer bot spikes |
| `handleModerationEvent` | `moderation` | Update risk scores on reports |

```javascript
// Fraud detection on gift
async function detectGiftFraud(event) {
  if (event.event === 'gift.sent') {
    const { riskScore } = await fraudService.evaluateGiftRisk(userId, {
      ip: event.ip,
      deviceFingerprint: event.deviceFingerprint,
    });
    if (riskScore >= 80) {
      await addBotDetectionJob('enforce', { 
        userId, 
        reason: `Gift fraud risk ${riskScore}` 
      });
    }
  }
}

// Account takeover detection
async function detectATO(event) {
  const geo = await geoService.lookupAsync(event.ip);
  await accountTakeoverService.recordLoginAndCheckATO(userId, {
    ip: event.ip,
    country: geo?.country,
    deviceFingerprint: event.deviceFingerprint,
  });
}
```

### Analytics Consumer

File: `packages/api/src/workers/analyticsEventConsumer.js`

```javascript
async function handleEvent(payload, topic) {
  const { type, userId, ...rest } = payload;
  
  // Persist to EventBusLog for analytics
  await db.EventBusLog.create({
    topic,
    eventType: type || 'unknown',
    userId: userId || null,
    meta: { ...rest },
  });
}

async function start() {
  const topics = [TOPICS.ANALYTICS, TOPICS.PAYMENTS, TOPICS.LIVE_EVENTS];
  await kafka.startConsumer('millo-analytics-consumer', topics, handleEvent);
}
```

### Notifications Consumer

File: `packages/api/src/workers/notificationsEventConsumer.js`

```javascript
async function handleEvent(payload, topic) {
  const { userId, type, title, body, meta = {} } = payload;
  if (!userId) return;
  
  await notifyUser(userId, {
    type: type || 'event_bus',
    title: title ?? 'Notification',
    body: body ?? '',
    meta,
  });
}

async function start() {
  await kafka.startConsumer(
    'millo-notifications-consumer',
    [TOPICS.NOTIFICATIONS],
    handleEvent
  );
}
```

---

## 5. Event Persistence

### EventBusLog Schema

File: `packages/database/src/schemas/EventBusLog.js`

```javascript
const schema = new mongoose.Schema({
  topic: { type: String, required: true, index: true },
  eventType: { type: String, default: 'unknown', index: true },
  userId: { type: ObjectId, ref: 'User', index: true },
  meta: { type: Mixed, default: {} },
}, { timestamps: true });

schema.index({ topic: 1, createdAt: -1 });
schema.index({ eventType: 1, createdAt: -1 });
```

### Query Examples

```javascript
// Get recent payment events for user
const events = await EventBusLog.find({
  topic: 'payments',
  userId: userId,
}).sort({ createdAt: -1 }).limit(50);

// Aggregate events by type
const stats = await EventBusLog.aggregate([
  { $match: { topic: 'live_events', createdAt: { $gte: oneDayAgo } } },
  { $group: { _id: '$eventType', count: { $sum: 1 } } },
]);
```

---

## 6. Consumer Groups

| Consumer Group | Topics | Purpose |
|----------------|--------|---------|
| `millo-abuse-consumer` | All fraud-related | Fraud detection pipeline |
| `millo-analytics-consumer` | analytics, payments, live_events | Event persistence |
| `millo-notifications-consumer` | notifications | Push/email delivery |
| `millo-recommendation-consumer` | user_activity, analytics | Feed personalization |

---

## 7. Event Flow Examples

### Gift Transaction Flow

```
1. User sends gift in live stream
   │
   ▼
2. API creates gift transaction
   │
   ▼
3. Publish to 'payments' topic
   {
     event: 'gift.sent',
     userId: sender,
     receiverId: creator,
     streamId: stream,
     cost: 50
   }
   │
   ├──────────────────┬──────────────────┬──────────────────┐
   ▼                  ▼                  ▼                  ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Analytics│    │  Fraud   │    │  Trust   │    │ Notif    │
│ Consumer │    │ Consumer │    │  Graph   │    │ Consumer │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │
     ▼               ▼               ▼               ▼
  EventBusLog    detectGiftFraud  Neo4j Graph    Notify Creator
```

### Login Flow

```
1. User logs in
   │
   ▼
2. Create session
   │
   ▼
3. Publish to 'auth_events' topic
   {
     event: 'login.success',
     userId: '...',
     ip: '...',
     deviceFingerprint: '...'
   }
   │
   ├─────────────────────┐
   ▼                     ▼
┌──────────────┐   ┌──────────────┐
│  ATO Check   │   │ Trust Graph  │
│  detectATO   │   │    Update    │
└──────┬───────┘   └──────┬───────┘
       │                  │
       ▼                  ▼
  Flag suspicious      Update login
  login patterns       relationships
```

---

## 8. Environment Variables

```env
# Kafka
KAFKA_ENABLED=true
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=millo-api

# Consumer Groups
KAFKA_ABUSE_CONSUMER_GROUP_ID=millo-abuse-consumer
KAFKA_ANALYTICS_CONSUMER_GROUP_ID=millo-analytics-consumer
KAFKA_NOTIFICATIONS_CONSUMER_GROUP_ID=millo-notifications-consumer

# RabbitMQ (alternative)
EVENT_BUS=rabbitmq
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_EXCHANGE=millo_events
```

---

## 9. Scaling & Reliability

### Partitioning Strategy

| Topic | Partition Key | Reason |
|-------|---------------|--------|
| `payments` | `userId` | User-ordered transactions |
| `live_events` | `streamId` | Stream-ordered events |
| `auth_events` | `userId` | User session ordering |
| `user_activity` | `userId` | User behavior ordering |
| `moderation` | `targetId` | Content-ordered moderation |

### Consumer Scaling

```yaml
# Kubernetes deployment example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kafka-abuse-consumer
spec:
  replicas: 3  # Scale horizontally
  template:
    spec:
      containers:
      - name: consumer
        env:
        - name: KAFKA_ABUSE_CONSUMER_GROUP_ID
          value: millo-abuse-consumer
```

### Retry & Dead Letter

```javascript
// Consumer with retry logic
async function handleWithRetry(payload, topic, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await processEvent(payload);
      return;
    } catch (err) {
      if (i === retries - 1) {
        // Send to dead letter queue
        await kafka.publish('dead_letter', { 
          originalTopic: topic, 
          payload, 
          error: err.message 
        });
      }
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

---

## Summary

| Component | Implementation | Purpose |
|-----------|----------------|---------|
| Event Bus | Kafka/RabbitMQ | Message broker |
| Topics | 9 topics | Domain separation |
| Producers | Routes/Services | Event emission |
| Consumers | 3+ consumer groups | Event processing |
| Persistence | EventBusLog | Analytics storage |
| Detection | Abuse handlers | Fraud prevention |

This event-driven architecture enables:
- **Decoupling** — Services communicate asynchronously
- **Scalability** — Consumers scale independently
- **Reliability** — Message persistence and replay
- **Real-time** — Sub-second event processing
- **Observability** — Event logging and analytics
