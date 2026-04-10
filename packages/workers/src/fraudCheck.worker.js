'use strict';
/**
 * Fraud check worker — run fraud checks asynchronously after gift transactions.
 * Complements synchronous blocking checks; flags users for review when patterns detected.
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const { connection } = require('./queues');
const path = require('path');
const fraudService = require(path.resolve(__dirname, '../../api/src/services/fraudService'));

async function processFraudCheck(job) {
  const tx = job.data;
  const senderId = tx.sender_id || tx.senderId;
  const receiverId = tx.receiver_id || tx.receiverId;
  if (!senderId || !receiverId) return;

  const results = {};
  const velocity = await fraudService.checkGiftVelocity(senderId);
  results.velocity = { count: velocity.count, allowed: velocity.allowed };
  if (!velocity.allowed) {
    await fraudService.logGiftSent(senderId, tx.amountCents || 0, {
      refType: 'gift_async_flag',
      refId: tx.giftId,
      meta: { source: 'fraud_worker', velocityCount: velocity.count },
    }).catch(() => {});
    await fraudService.applyShadowBanForFraud(senderId, { reason: 'gift_velocity_async', meta: { velocityCount: velocity.count } }).catch(() => {});
  }

  const circular = await fraudService.checkCircularGifts(senderId, receiverId);
  results.circular = { count: circular.count, allowed: circular.allowed };
  if (!circular.allowed) {
    const db = require('@millo/database');
    await db.FraudEvent.create({
      userId: senderId,
      eventType: 'gift',
      action: 'review',
      signals: ['circular_gifts_async'],
      refType: 'gift',
      refId: tx.giftId,
      meta: { source: 'fraud_worker', circularCount: circular.count },
    }).catch(() => {});
    await fraudService.applyShadowBanForFraud(senderId, { reason: 'circular_gifts_async', meta: { circularCount: circular.count } }).catch(() => {});
    const { computeGiftSplit } = require('@millo/economy/src/gifts');
    const split = await computeGiftSplit(receiverId, tx.amountCents || 0);
    if (split.creatorCents > 0) {
      await fraudService.applyPayoutHold(receiverId, split.creatorCents, { reason: 'circular_gifts_detected', meta: { giftId: tx.giftId, circularCount: circular.count } }).catch(() => {});
    }
  }

  return results;
}

const worker = new Worker(
  'fraud-check',
  async (job) => processFraudCheck(job),
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[fraud-check-worker] Job failed', job?.id, err?.message);
});

module.exports = { worker, processFraudCheck };
