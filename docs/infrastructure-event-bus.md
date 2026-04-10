# Infrastructure Event Bus

Event-driven architecture: Kafka or RabbitMQ with unified produce/consume API.

## Backend

- **Kafka** (default): `KAFKA_ENABLED=true`, `KAFKA_BROKERS=localhost:9092`. Uses `kafkajs`.
- **RabbitMQ**: `EVENT_BUS=rabbitmq`, `RABBITMQ_URL=amqp://localhost`. Uses topic exchange `millo_events` (or `RABBITMQ_EXCHANGE`). Optional dependency: `amqplib` (install if using RabbitMQ).

Unified API: `services/eventBus.js` — `produce(topic, payload)` / `publish(topic, payload)`. When RabbitMQ is set, the event bus uses RabbitMQ; otherwise Kafka.

## Topics

| Topic            | Purpose                          |
|------------------|-----------------------------------|
| `payments`       | Coin purchase, payout, refunds   |
| `live_events`    | Live stream events, co-host, chat |
| `moderation`     | Moderation actions, reports      |
| `moderation_events` | Moderation event stream      |
| `notifications`  | Push/email notification payloads |
| `analytics`      | Analytics events                 |
| `fraud`          | Fraud signals                    |
| `user_activity`  | User activity for abuse pipeline |
| `auth_events`    | Login, signup, ATO               |

## Producer example

```js
const eventBus = require('./services/eventBus');

await eventBus.produce('payments', {
  type: 'coin_purchase',
  userId: user._id,
  amountCents,
  packId,
});
```

Existing code uses `kafka.publish(kafka.TOPICS.PAYMENTS, event)`; `kafkaEventBus` also exposes `produce()` as an alias of `publish()`.

## Consumers

| Worker                    | Consumer group                    | Topics                                      |
|---------------------------|-----------------------------------|---------------------------------------------|
| **Fraud worker**          | `millo-abuse-consumer`            | payments, live_events, auth_events, moderation, user_activity |
| **Analytics worker**      | `millo-analytics-consumer`        | analytics, payments, live_events            |
| **Notifications worker** | `millo-notifications-consumer`    | notifications                               |

- **Fraud worker** (`workers/kafkaAbuseConsumer.js`): Registers handlers for ATO, gift fraud, live abuse, moderation; started from API bootstrap.
- **Analytics worker** (`workers/analyticsEventConsumer.js`): Persists events to `EventBusLog` (topic, eventType, userId, meta) when the collection exists.
- **Notifications worker** (`workers/notificationsEventConsumer.js`): For each message on `notifications`, calls `notifyUser(userId, { type, title, body, meta })`.

## Event bus modules

- `services/eventBus.js` — Unified `produce` / `publish`; chooses Kafka or RabbitMQ from env.
- `services/kafkaEventBus.js` — Kafka producer, `produce`/`publish`, `startConsumer`, `startAbuseConsumer`, `addAbuseHandler`.
- `services/rabbitmqEventBus.js` — RabbitMQ publisher (topic exchange); same `publish(topic, event)`.

## Database

- **EventBusLog** (optional): Sink for analytics consumer; fields `topic`, `eventType`, `userId`, `meta`, timestamps.
