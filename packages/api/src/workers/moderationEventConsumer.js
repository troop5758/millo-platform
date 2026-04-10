'use strict';
/**
 * Moderation event consumer — subscribes to moderation topic for content review actions.
 * Handles automatic moderation decisions, appeal processing, strike assignments.
 * Kafka consumer group: millo-moderation-consumer.
 * https://milloapp.com
 */
const kafka = require('../services/kafkaEventBus');
const TOPICS = kafka.TOPICS;

let _consumer = null;

/**
 * Handle moderation events from the event bus.
 */
async function handleEvent(payload, topic) {
  const { type, event, userId, targetId, contentId, contentType, reason, action, meta = {} } = payload || {};
  const eventType = type || event;

  if (!eventType) return;

  const db = require('@millo/database');
  const log = console;

  try {
    switch (eventType) {
      case 'content.flagged':
      case 'content_flagged': {
        if (!contentId || !contentType) return;
        // Auto-moderation: queue for AI review
        const aiModeration = require('../services/aiModerationService');
        if (aiModeration?.queueForReview) {
          await aiModeration.queueForReview(contentId, contentType, {
            reason: reason || 'auto_flagged',
            reporterId: userId,
            ...meta,
          });
        }
        break;
      }

      case 'content.removed':
      case 'content_removed': {
        if (!contentId || !contentType || !targetId) return;
        // Assign strike to user
        await db.ModerationStrike?.create({
          userId: targetId,
          contentId,
          contentType,
          reason: reason || 'content_violation',
          issuedAt: new Date(),
          meta,
        }).catch(() => {});

        // Check if user should be suspended
        const strikeCount = await db.ModerationStrike?.countDocuments({
          userId: targetId,
          appealStatus: { $ne: 'upheld' },
        }) || 0;

        if (strikeCount >= 3) {
          await db.User?.findByIdAndUpdate(targetId, {
            $set: { status: 'suspended', suspensionReason: `${strikeCount} moderation strikes` },
          });
          log.info({ userId: targetId, strikeCount }, '[moderation] User suspended for strikes');
        }
        break;
      }

      case 'appeal.submitted':
      case 'appeal_submitted': {
        if (!contentId) return;
        // Update appeal status
        await db.ModerationAppeal?.findOneAndUpdate(
          { contentId, status: 'pending' },
          { $set: { queuedAt: new Date() } }
        );
        break;
      }

      case 'appeal.resolved':
      case 'appeal_resolved': {
        const { appealId, decision } = meta;
        if (!appealId) return;
        // If appeal upheld, remove strike
        if (decision === 'upheld') {
          await db.ModerationStrike?.findOneAndUpdate(
            { _id: appealId },
            { $set: { appealStatus: 'upheld', resolvedAt: new Date() } }
          );
        }
        break;
      }

      case 'user.warned':
      case 'user_warned': {
        if (!targetId) return;
        // Send warning notification
        const { notifyUser } = require('../lib/notifyUser');
        await notifyUser(targetId, {
          type: 'moderation_warning',
          title: 'Content Warning',
          body: reason || 'Your content has been flagged for policy violation.',
          meta: { contentId, ...meta },
        });
        break;
      }

      case 'report.created':
      case 'report_created': {
        if (!targetId) return;
        // Update user risk score
        const { addBotDetectionJob } = require('../lib/botDetectionQueue');
        await addBotDetectionJob('risk_score_update', { userId: String(targetId) }, { delay: 0 });
        break;
      }

      case 'shadow_ban.applied':
      case 'shadow_ban_applied': {
        if (!targetId) return;
        const { reduceReach } = require('../services/enforcementEngine');
        await reduceReach(targetId, { reason: reason || 'kafka_moderation', performedBy: null });
        break;
      }

      case 'shadow_ban.lifted':
      case 'shadow_ban_lifted': {
        if (!targetId) return;
        await db.Moderation?.findOneAndUpdate(
          { userId: targetId },
          { $set: { shadowBanned: false, shadowBanLiftedAt: new Date() } }
        );
        break;
      }

      default:
        // Log unknown events for debugging
        if (process.env.NODE_ENV !== 'production') {
          log.debug({ eventType, payload }, '[moderation] Unknown event type');
        }
    }

    // Log all moderation events for audit
    await db.EventBusLog?.create({
      topic,
      eventType,
      userId: userId || targetId || null,
      meta: { contentId, contentType, action, reason, ...meta },
    }).catch(() => {});

  } catch (err) {
    log.error({ err, eventType, payload }, '[moderation] Event handler error');
  }
}

async function start(opts = {}) {
  if (!kafka.isEnabled()) {
    opts.log?.info?.('[moderationEventConsumer] Event bus disabled, skipping');
    return { consumer: null };
  }

  const groupId = process.env.KAFKA_MODERATION_CONSUMER_GROUP_ID || 'millo-moderation-consumer';
  const topics = [TOPICS.MODERATION, TOPICS.MODERATION_EVENTS];

  const { consumer, run } = await kafka.startConsumer(groupId, topics, handleEvent, {
    fromBeginning: false,
    log: opts.log || console,
  });

  _consumer = consumer;
  if (run) run.catch(() => {});

  opts.log?.info?.({ groupId, topics }, '[moderationEventConsumer] Started');
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

module.exports = { start, stop, handleEvent };
