'use strict';
/**
 * Publish live/HTTP gift events to Kafka topic gift.sent (socket bridge + REST).
 * Wallet debit/credit runs in API first; payload includes settled: true for the gift worker.
 * https://milloapp.com
 */
const crypto = require('crypto');
const kafka = require('../services/kafkaEventBus');

/**
 * @param {{
 *   senderId: string|import('mongoose').Types.ObjectId,
 *   receiverId: string|import('mongoose').Types.ObjectId,
 *   giftId: string,
 *   coins: number,
 *   streamId?: string|null,
 *   ip?: string|null,
 *   deviceFingerprint?: string|null,
 *   source?: string,
 *   fraudQueueEnqueued?: boolean,
 *   giftEventId?: string,
 * }} p
 */
function publishGiftSentKafka(p) {
  if (!p?.senderId || !p?.receiverId || !p?.giftId) return Promise.resolve({ ok: false, skipped: true });
  const giftEventId = p.giftEventId || crypto.randomUUID();
  const coins = Math.max(0, Number(p.coins) || 0);
  const body = {
    event: 'gift.sent',
    type: 'gift.sent',
    giftEventId,
    settled: true,
    senderId: String(p.senderId),
    receiverId: String(p.receiverId),
    giftId: String(p.giftId),
    coins,
    amountCents: coins * 100,
    streamId: p.streamId ? String(p.streamId) : null,
    ip: p.ip || null,
    deviceFingerprint: p.deviceFingerprint || null,
    source: p.source || 'api',
    fraudQueueEnqueued: !!p.fraudQueueEnqueued,
  };
  return kafka.publish(kafka.TOPICS.GIFT_SENT, body, { key: String(p.senderId) });
}

module.exports = { publishGiftSentKafka };
