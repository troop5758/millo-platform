# Event Bus Architecture

Millo uses an event-driven architecture powered by Kafka (primary) or RabbitMQ (alternative).

## Architecture Overview

```
Producers (API Routes, Services)
           │
           ▼
    ┌─────────────────┐
    │   Event Bus     │
    │  (Kafka/RMQ)    │
    └────────┬────────┘
             │
    ┌────────┴────────────────────────────────────┐
    │                    │                        │
    ▼                    ▼                        ▼
┌─────────┐      ┌─────────────┐         ┌───────────────┐
│Analytics│      │ Moderation  │         │    Fraud      │
│Consumer │      │  Consumer   │         │   Consumer    │
└─────────┘      └─────────────┘         └───────────────┘
    │                    │                        │
    ▼                    ▼                        ▼
┌─────────┐      ┌─────────────┐         ┌───────────────┐
│ MongoDB │      │ Strike Sys  │         │  Risk Score   │
│ Metrics │      │ Shadow Ban  │         │  Enforcement  │
└─────────┘      └─────────────┘         └───────────────┘
```

## Quick Start

### Using Docker (Recommended)

```bash
# Start Kafka with Zookeeper
docker-compose up -d kafka

# Or standalone
docker run -p 9092:9092 bitnami/kafka
```

### Configuration

```env
# Kafka (primary)
KAFKA_ENABLED=true
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=millo-api

# Optional: Retry and DLQ settings
KAFKA_MAX_RETRIES=3
KAFKA_RETRY_DELAY_MS=1000
KAFKA_ENABLE_DLQ=true

# OR RabbitMQ (alternative)
EVENT_BUS=rabbitmq
RABBITMQ_URL=amqp://localhost
```

## Topics

| Topic | Description | Producers | Consumers |
|-------|-------------|-----------|-----------|
| `payments` | Payment events | Stripe webhook, Coin purchase | Analytics, Fraud |
| `live_events` | Live stream events | Live routes | Analytics, Abuse |
| `moderation` | Content moderation | AI moderation, Reports | Moderation |
| `moderation_events` | Moderation actions | Admin routes | Moderation |
| `notifications` | User notifications | All services | Notifications |
| `analytics` | Analytics events | All routes | Analytics |
| `fraud` | Fraud alerts | Fraud detection | Fraud |
| `user_activity` | User behavior | Activity service | Abuse |
| `auth_events` | Auth events | Login, OAuth | Fraud, Abuse |

### Dead Letter Queues

Failed events are automatically sent to DLQ topics:
- `payments.dlq`
- `moderation.dlq`
- `fraud.dlq`

## Consumers

### 1. Analytics Consumer
**Group:** `millo-analytics-consumer`
**Topics:** `analytics`, `payments`, `live_events`

Persists events to `EventBusLog` collection for platform metrics.

### 2. Notifications Consumer
**Group:** `millo-notifications-consumer`
**Topics:** `notifications`

Delivers push notifications and in-app messages via `notifyUser`.

### 3. Moderation Consumer
**Group:** `millo-moderation-consumer`
**Topics:** `moderation`, `moderation_events`

Handles:
- Content flagging → AI review queue
- Content removal → Strike assignment
- Appeal processing
- Shadow ban management

### 4. Fraud Consumer
**Group:** `millo-fraud-consumer`
**Topics:** `fraud`, `payments`, `auth_events`

Handles:
- Payment fraud detection
- Chargeback processing
- Gift fraud blocking
- Multi-account detection
- Bot enforcement

### 5. Abuse Consumer
**Group:** `millo-abuse-consumer`
**Topics:** `user_activity`, `auth_events`, `payments`, `live_events`, `moderation_events`

Runs behavioral analysis, ATO detection, gift fraud checks.

## Usage

### Publishing Events

```javascript
const eventBus = require('./services/eventBus');

// Simple publish
await eventBus.publish('payments', {
  type: 'coin_purchase',
  userId: '123',
  amount: 1000,
});

// With key for partitioning
const kafka = require('./services/kafkaEventBus');
await kafka.publish('live_events', {
  type: 'viewer.join',
  streamId: 'abc',
  userId: '123',
}, { key: 'abc' });

// Batch publish
await kafka.publishBatch('analytics', [
  { type: 'page_view', path: '/home' },
  { type: 'page_view', path: '/explore' },
]);
```

### Event Format

All events include:
```json
{
  "ts": "2026-02-25T10:30:00.000Z",
  "type": "event_type",
  "userId": "optional",
  ...customFields
}
```

## Consumer Orchestrator

The orchestrator manages all consumer lifecycle:

```javascript
const orchestrator = require('./workers/eventBusOrchestrator');

// Start all consumers
await orchestrator.startAll({ log: console });

// Start specific consumer
await orchestrator.startConsumer('fraud', { log: console });

// Stop all
await orchestrator.stopAll();

// Health check
const health = orchestrator.healthCheck();
// { healthy: true, running: 5, total: 5, consumers: [...] }

// Get status
const status = orchestrator.getStatus();
// { enabled: true, backend: 'kafka', brokers: [...], topics: [...] }
```

## Retry Logic

Failed publishes retry with exponential backoff:

1. Attempt 1: immediate
2. Attempt 2: 1 second delay
3. Attempt 3: 2 second delay
4. Attempt 4: 4 second delay (if KAFKA_MAX_RETRIES > 3)

If all retries fail, event is sent to DLQ.

## Health Checks

```javascript
const kafka = require('./services/kafkaEventBus');

const health = await kafka.healthCheck();
// {
//   healthy: true,
//   brokers: ['localhost:9092'],
//   topicCount: 12
// }
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KAFKA_ENABLED` | `false` | Enable Kafka |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated brokers |
| `KAFKA_CLIENT_ID` | `millo-api` | Client identifier |
| `KAFKA_MAX_RETRIES` | `3` | Max publish retries |
| `KAFKA_RETRY_DELAY_MS` | `1000` | Base retry delay |
| `KAFKA_ENABLE_DLQ` | `true` | Enable dead letter queues |
| `KAFKA_PARTITIONS` | `3` | Default partitions for new topics |
| `KAFKA_REPLICATION_FACTOR` | `1` | Replication factor |
| `EVENT_BUS_CONSUMERS` | (all) | Comma-separated consumer names |

## RabbitMQ Alternative

When `EVENT_BUS=rabbitmq`:

```env
EVENT_BUS=rabbitmq
RABBITMQ_URL=amqp://user:pass@localhost:5672
RABBITMQ_EXCHANGE=millo_events
```

Uses topic exchange with routing keys matching topic names.

## Monitoring

### Metrics to Track

- Events produced/second
- Consumer lag
- Processing time per event
- DLQ event count
- Consumer errors

### Grafana Dashboard

Key panels:
- Topic throughput
- Consumer group status
- Event processing latency
- Error rates by topic

## Best Practices

1. **Always include `userId`** in events for partitioning
2. **Use specific event types** like `gift.sent` not generic `event`
3. **Include metadata** for debugging
4. **Handle DLQ events** in admin dashboard
5. **Monitor consumer lag** to prevent backlog

## Example: Publishing Payment Event

```javascript
// After successful Stripe checkout
const eventBus = require('./services/eventBus');

await eventBus.publish('payments', {
  type: 'coins.purchased',
  userId: user._id.toString(),
  amount: checkoutSession.amount_total,
  coins: coinsAwarded,
  stripeSessionId: checkoutSession.id,
  ip: request.ip,
});
```

## Example: Handling Moderation Event

```javascript
// Consumer receives:
{
  "ts": "2026-02-25T10:30:00.000Z",
  "type": "content.removed",
  "contentId": "video_123",
  "contentType": "video",
  "targetId": "user_456",
  "reason": "policy_violation"
}

// Consumer action:
// 1. Assign strike to user
// 2. Check if suspension needed
// 3. Send notification
```
