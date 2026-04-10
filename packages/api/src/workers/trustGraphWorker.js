'use strict';
/**
 * Graph Ingestion Worker — updates Neo4j Trust Graph from activity events.
 * Consumes Kafka events (login, gift_sent, follow, like, payment) and writes relationships.
 * When NEO4J_URI is not set, processEvent is a no-op.
 * https://milloapp.com
 */
const neo4jClusterService = require('../services/neo4jClusterService');
const kafkaEventBus = require('../services/kafkaEventBus');

// Event buffer for batch processing
let _eventBuffer = [];
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5000;
let _flushTimer = null;

/**
 * Process one event: map to Trust Graph relationships and write to Neo4j.
 * @param {object} event - Kafka payload: type/eventType/event, userId, device, sender, receiver, etc.
 */
async function processEvent(event) {
  if (!neo4jClusterService.isEnabled()) return;

  const type = event.type ?? event.eventType ?? event.event ?? '';
  const userId = event.userId ?? event.user_id ?? event.subject ?? event.senderId;
  const deviceId = event.device ?? event.deviceId ?? event.deviceFingerprint ?? event.visitorId;
  const ipAddress = event.ip ?? event.ipAddress;

  // Login / Auth events — link user to device and IP
  if (type === 'login' || type === 'auth' || type === 'auth.login') {
    if (userId && deviceId) {
      await neo4jClusterService.linkUserDevice(userId, deviceId, {
        userAgent: event.userAgent,
      });
    }
    if (userId && ipAddress) {
      await neo4jClusterService.linkUserIP(userId, ipAddress, {
        country: event.country,
      });
    }
    return;
  }

  // Gift events — link sender to receiver
  if (type === 'gift' || type === 'gift_sent' || type === 'gift.sent') {
    const sender = event.sender ?? userId ?? event.senderId;
    const receiver = event.receiver ?? event.receiverId ?? event.receiver_id;
    const coins = event.coins ?? event.cost ?? event.amountCoins ?? 0;
    if (sender && receiver) {
      await neo4jClusterService.linkGift(sender, receiver, { coins });
    }
    return;
  }

  // Follow events
  if (type === 'follow' || type === 'user.followed') {
    const followerId = userId ?? event.followerId;
    const followingId = event.followingId ?? event.targetId ?? event.receiver;
    if (followerId && followingId) {
      await neo4jClusterService.linkFollow(followerId, followingId);
    }
    return;
  }

  // Unfollow events
  if (type === 'unfollow' || type === 'user.unfollowed') {
    const followerId = userId ?? event.followerId;
    const followingId = event.followingId ?? event.targetId ?? event.receiver;
    if (followerId && followingId) {
      await neo4jClusterService.unlinkFollow(followerId, followingId);
    }
    return;
  }

  // Like events
  if (type === 'like' || type === 'video.liked' || type === 'content.liked') {
    const contentId = event.contentId ?? event.videoId ?? event.targetId;
    const contentType = event.contentType ?? 'video';
    if (userId && contentId) {
      await neo4jClusterService.linkLike(userId, contentId, contentType);
    }
    return;
  }

  // Subscription events
  if (type === 'subscription' || type === 'subscription.created' || type === 'subscribed') {
    const subscriberId = userId ?? event.subscriberId;
    const creatorId = event.creatorId ?? event.targetId;
    if (subscriberId && creatorId) {
      await neo4jClusterService.linkSubscription(subscriberId, creatorId, {
        tierId: event.tierId,
      });
    }
    return;
  }

  // Payment events
  if (type === 'payment' || type === 'payment.completed' || type === 'coins.purchased') {
    const paymentId = event.paymentId ?? event.transactionId ?? event.stripeSessionId;
    if (userId && paymentId) {
      await neo4jClusterService.linkPayment(userId, paymentId, {
        amount: event.amount ?? event.amountCents,
        currency: event.currency,
      });
    }
    return;
  }

  // Device registration
  if (type === 'device.registered' || type === 'device') {
    if (userId && deviceId) {
      await neo4jClusterService.linkUserDevice(userId, deviceId, {
        userAgent: event.userAgent,
      });
    }
    if (userId && ipAddress) {
      await neo4jClusterService.linkUserIP(userId, ipAddress, {
        country: event.country,
      });
    }
    return;
  }
}

/**
 * Add event to buffer for batch processing.
 */
function bufferEvent(event) {
  if (!neo4jClusterService.isEnabled()) return;

  _eventBuffer.push(event);

  if (_eventBuffer.length >= BATCH_SIZE) {
    flushBuffer();
  }

  // Start flush timer if not running
  if (!_flushTimer) {
    _flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);
  }
}

/**
 * Flush buffered events to Neo4j.
 */
async function flushBuffer() {
  if (_eventBuffer.length === 0) return;

  const events = _eventBuffer.splice(0, BATCH_SIZE);

  try {
    const result = await neo4jClusterService.batchIngest(events);
    if (process.env.NODE_ENV !== 'production' && result.processed > 0) {
      console.debug(`[trustGraph] Batch ingested ${result.processed} events`);
    }
  } catch (err) {
    // Re-add failed events to buffer (with limit to prevent memory issues)
    if (_eventBuffer.length < 1000) {
      _eventBuffer.unshift(...events);
    }
  }
}

/**
 * Register Kafka handlers so activity events are written to the trust graph.
 * Call before starting the abuse consumer (e.g. from kafkaAbuseConsumer or index).
 */
function registerKafkaHandlers() {
  if (!neo4jClusterService.isEnabled() || !kafkaEventBus.isEnabled()) return;

  // Auth events — login, device registration
  kafkaEventBus.addAbuseHandler(kafkaEventBus.TOPICS.AUTH_EVENTS, (payload) =>
    processEvent({ type: 'login', ...payload })
  );

  // Payment events — gifts, purchases
  kafkaEventBus.addAbuseHandler(kafkaEventBus.TOPICS.PAYMENTS, (payload) => {
    const ev = payload.event ?? payload.eventType ?? payload.type ?? '';
    if (ev === 'gift_sent' || ev === 'gift.sent') {
      return processEvent({ type: 'gift_sent', ...payload });
    }
    if (ev === 'coins.purchased' || ev === 'payment.completed') {
      return processEvent({ type: 'payment', ...payload });
    }
  });

  // User activity — follows, likes
  kafkaEventBus.addAbuseHandler(kafkaEventBus.TOPICS.USER_ACTIVITY, (payload) => {
    const ev = payload.event ?? payload.eventType ?? payload.type ?? '';
    if (ev === 'follow' || ev === 'user.followed') {
      return processEvent({ type: 'follow', ...payload });
    }
    if (ev === 'unfollow' || ev === 'user.unfollowed') {
      return processEvent({ type: 'unfollow', ...payload });
    }
    if (ev === 'like' || ev === 'video.liked' || ev === 'content.liked') {
      return processEvent({ type: 'like', ...payload });
    }
  });

  // Live events — gift sends during streams
  kafkaEventBus.addAbuseHandler(kafkaEventBus.TOPICS.LIVE_EVENTS, (payload) => {
    const ev = payload.event ?? payload.eventType ?? payload.type ?? '';
    if (ev === 'gift_sent' || ev === 'gift.sent' || ev === 'live.gift') {
      return processEvent({ type: 'gift_sent', ...payload });
    }
  });

  console.info('[trustGraph] Kafka handlers registered');
}

/**
 * Stop the worker and flush remaining events.
 */
async function stop() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  await flushBuffer();
}

module.exports = {
  processEvent,
  bufferEvent,
  flushBuffer,
  registerKafkaHandlers,
  stop,
};
