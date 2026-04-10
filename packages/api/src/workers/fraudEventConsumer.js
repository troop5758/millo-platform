'use strict';
/**
 * Fraud detection event consumer — subscribes to fraud, payments, auth_events topics.
 * Handles payment fraud detection, chargebacks, suspicious activity.
 * Kafka consumer group: millo-fraud-consumer.
 * https://milloapp.com
 */
const kafka = require('../services/kafkaEventBus');
const TOPICS = kafka.TOPICS;

let _consumer = null;

const { withWalletLock, LockContentionError } = require('../lib/walletLock');

/**
 * Handle fraud-related events.
 */
async function handleEvent(payload, topic) {
  const { type, event, userId, transactionId, amount, amountCents, ip, deviceFingerprint, meta = {} } = payload || {};
  const eventType = type || event;

  if (!eventType) return;

  const db = require('@millo/database');
  const { writeFinancialAuditLog } = db;
  const log = console;

  try {
    switch (eventType) {
      case 'payment.suspicious':
      case 'payment_suspicious': {
        if (!userId || !transactionId) return;
        // Flag transaction for review
        await db.Payment?.findOneAndUpdate(
          { referenceId: transactionId },
          { $set: { 'meta.flaggedForReview': true, 'meta.flagReason': meta.reason || 'suspicious_activity' } }
        );

        // Increase user risk score
        await updateUserRiskScore(userId, 30, 'suspicious_payment');
        break;
      }

      case 'chargeback.received':
      case 'chargeback_received': {
        if (!userId || !transactionId) return;
        // Create chargeback record
        await db.Chargeback?.create({
          transactionId,
          userId,
          reason: meta.reason || 'unknown',
          status: 'pending',
          amountCents: amountCents || amount,
          createdAt: new Date(),
        }).catch(() => {});

        // Freeze user account
        await db.User?.findByIdAndUpdate(userId, {
          $set: { 
            status: 'suspended', 
            suspensionReason: 'chargeback_received',
            'meta.chargebackPending': true,
          },
        });

        // Reverse any coins credited (serialize with all other wallet mutations)
        try {
          await withWalletLock(userId, async () => {
            const wallet = await db.Wallet?.findOne({ userId });
            if (!wallet || !amountCents) return;
            const coinsToReverse = Math.floor(amountCents / 10); // Example: 10 cents per coin
            if (coinsToReverse <= 0) return;
            const updated = await db.Wallet.findByIdAndUpdate(
              wallet._id,
              { $inc: { balanceCents: -coinsToReverse } },
              { new: true }
            );
            await db.LedgerEntry?.create({
              userId,
              type: 'chargeback_reversal',
              delta: -coinsToReverse,
              balance: Math.max(0, (wallet.balanceCents || 0) - coinsToReverse),
              reference: transactionId,
            }).catch(() => {});
            await writeFinancialAuditLog({
              action: 'CHARGEBACK_WALLET_REVERSAL',
              walletId: wallet._id,
              amountCents: -coinsToReverse,
              balanceAfterCents: updated?.balanceCents,
              refType: 'chargeback',
              refId: String(transactionId),
              actorId: userId,
              meta: { topic, originalAmountCents: amountCents },
            });
          });
        } catch (lockErr) {
          if (lockErr instanceof LockContentionError) {
            log.warn({ userId, transactionId }, '[fraud] chargeback wallet reversal skipped — redis lock held');
          } else {
            throw lockErr;
          }
        }

        log.warn({ userId, transactionId }, '[fraud] Chargeback received, account suspended');
        break;
      }

      case 'gift.fraud_detected':
      case 'gift_fraud_detected': {
        const senderId = userId || meta.senderId;
        const receiverId = meta.receiverId;
        if (!senderId) return;

        // Flag both accounts
        await updateUserRiskScore(senderId, 50, 'gift_fraud');
        if (receiverId) {
          await updateUserRiskScore(receiverId, 25, 'gift_fraud_receiver');
        }

        // Block further gifting
        await db.User?.findByIdAndUpdate(senderId, {
          $set: { 'meta.giftingBlocked': true, 'meta.giftingBlockedReason': 'fraud_detected' },
        });
        break;
      }

      case 'payout.fraud_detected':
      case 'payout_fraud_detected': {
        if (!userId) return;
        // Block payouts
        await db.User?.findByIdAndUpdate(userId, {
          $set: { 'meta.payoutsBlocked': true, 'meta.payoutsBlockedReason': 'fraud_detected' },
        });

        // Cancel pending payouts
        await db.PayoutRequest?.updateMany(
          { userId, status: 'pending' },
          { $set: { status: 'cancelled', cancelReason: 'fraud_detected' } }
        );

        await updateUserRiskScore(userId, 60, 'payout_fraud');
        break;
      }

      case 'multi_account.detected':
      case 'multi_account_detected': {
        const accounts = meta.accounts || [];
        if (!accounts.length) return;

        // Flag all linked accounts
        for (const accountId of accounts) {
          await updateUserRiskScore(accountId, 40, 'multi_account');
        }
        break;
      }

      case 'bot.detected':
      case 'bot_detected': {
        if (!userId) return;
        // Apply shadow ban
        await db.Moderation?.findOneAndUpdate(
          { userId },
          {
            $set: { shadowBanned: true, shadowBannedAt: new Date(), reason: 'bot_detected' },
          },
          { upsert: true }
        );
        await updateUserRiskScore(userId, 70, 'bot_detected');
        break;
      }

      case 'ip.high_risk':
      case 'ip_high_risk': {
        if (!ip) return;
        // Log high-risk IP
        await db.IPReputationLog?.create({
          ip,
          riskScore: meta.riskScore || 100,
          reason: meta.reason || 'high_risk',
          userId: userId || null,
          createdAt: new Date(),
        }).catch(() => {});
        break;
      }

      case 'device.blacklisted':
      case 'device_blacklisted': {
        if (!deviceFingerprint) return;
        // Blacklist device
        await db.Device?.updateMany(
          { visitorId: deviceFingerprint },
          { $set: { blacklisted: true, blacklistedAt: new Date(), blacklistReason: meta.reason } }
        );
        break;
      }

      case 'velocity.exceeded':
      case 'velocity_exceeded': {
        if (!userId) return;
        // Temporary rate limit
        await db.User?.findByIdAndUpdate(userId, {
          $set: { 
            'meta.velocityLimitedUntil': new Date(Date.now() + 3600000), // 1 hour
            'meta.velocityLimitReason': meta.reason,
          },
        });
        await updateUserRiskScore(userId, 20, 'velocity_exceeded');
        break;
      }

      default:
        if (process.env.NODE_ENV !== 'production') {
          log.debug({ eventType, topic }, '[fraud] Unknown event type');
        }
    }

    const safeType = String(eventType).replace(/[^a-zA-Z0-9_.]/g, '_');
    await writeFinancialAuditLog({
      action: `FRAUD_EVENT_${safeType}`.slice(0, 64),
      amountCents: amountCents ?? amount ?? 0,
      refType: 'fraud',
      refId: String(transactionId || userId || meta?.refId || 'unknown').slice(0, 128),
      actorId: userId || undefined,
      meta: { topic, eventType, ...meta },
    });

  } catch (err) {
    log.error({ err, eventType, payload }, '[fraud] Event handler error');
  }
}

/**
 * Update user risk score.
 */
async function updateUserRiskScore(userId, increment, reason) {
  if (!userId) return;
  const db = require('@millo/database');

  const user = await db.User?.findById(userId);
  const currentScore = user?.meta?.riskScore || 0;
  const newScore = Math.min(100, currentScore + increment);

  await db.User?.findByIdAndUpdate(userId, {
    $set: { 'meta.riskScore': newScore },
    $push: {
      'meta.riskHistory': {
        score: newScore,
        increment,
        reason,
        timestamp: new Date(),
      },
    },
  });

  const { applyRiskEnforcement } = require('../services/riskEnforcementEngine');
  await applyRiskEnforcement(String(userId), newScore, {
    source: 'fraud_event_consumer_risk_score',
    reason: reason ? String(reason).slice(0, 200) : undefined,
  }).catch(() => {});
}

async function start(opts = {}) {
  if (!kafka.isEnabled()) {
    opts.log?.info?.('[fraudEventConsumer] Event bus disabled, skipping');
    return { consumer: null };
  }

  const groupId = process.env.KAFKA_FRAUD_CONSUMER_GROUP_ID || 'millo-fraud-consumer';
  const topics = [TOPICS.FRAUD, TOPICS.PAYMENTS, TOPICS.AUTH_EVENTS];

  const { consumer, run } = await kafka.startConsumer(groupId, topics, handleEvent, {
    fromBeginning: false,
    log: opts.log || console,
  });

  _consumer = consumer;
  if (run) run.catch(() => {});

  opts.log?.info?.({ groupId, topics }, '[fraudEventConsumer] Started');
  return { consumer };
}

async function stop() {
  if (_consumer) {
    try {
      await _consumer.disconnect();
    } catch {}
    _consumer = null;
  }
}

module.exports = { start, stop, handleEvent, updateUserRiskScore };
