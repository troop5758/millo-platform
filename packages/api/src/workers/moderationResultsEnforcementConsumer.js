'use strict';
/**
 * Real-time moderation pipeline — consumes `moderation-results` (from packages/workers moderation.worker.js).
 * Maps violation → {@link ../services/enforcement.service} → {@link ../services/enforcementEngine} (persist + audit).
 * Flow: user chat → `chat-messages` → moderation worker → `moderation-results` → this consumer.
 * Opt out: MODERATION_RESULTS_ENFORCEMENT=false
 * https://milloapp.com
 */
const mongoose = require('mongoose');
const kafka = require('../services/kafkaEventBus');
const db = require('@millo/database');
const enforcement = require('../services/enforcement.service');
const enforcementEngine = require('../services/enforcementEngine');
const { writeAuditLog } = require('../services/auditLog');

let _consumer = null;

function isPipelineEnforcementEnabled() {
  return process.env.MODERATION_RESULTS_ENFORCEMENT !== 'false';
}

/**
 * @param {Record<string, unknown>} payload
 */
async function handleResult(payload) {
  const userId = payload.userId != null ? String(payload.userId) : null;
  if (!userId || !mongoose.isValidObjectId(userId)) return;

  const rawViolation = payload.violation || payload.reason || 'POLICY_VIOLATION';
  const violation = String(rawViolation).toUpperCase();
  const user = await db.User.findById(userId);
  if (!user) return;

  const action = enforcement.enforce(user.toObject(), violation);
  if (!action) return;

  const reasonBase = String(payload.reason || violation || 'moderation_pipeline').slice(0, 400);
  const reason = `[kafka_moderation] ${reasonBase}`.slice(0, 500);
  const engineOpts = { reason, performedBy: enforcementEngine.SYSTEM_MODERATOR_ID };
  const meta = {
    source: 'moderation_results',
    streamId: payload.streamId || null,
    sourceTopic: payload.sourceTopic || null,
    violation,
    enforcementAction: action,
  };

  switch (action) {
    case enforcement.ENFORCEMENT_ACTIONS.PERMA_BAN:
      await enforcementEngine.banUser(userId, engineOpts);
      break;
    case enforcement.ENFORCEMENT_ACTIONS.SHADOWBAN:
      await enforcementEngine.reduceReach(userId, engineOpts);
      break;
    case enforcement.ENFORCEMENT_ACTIONS.THROTTLE:
      await enforcementEngine.limitActions(userId, engineOpts);
      break;
    case enforcement.ENFORCEMENT_ACTIONS.TEMP_BAN:
      enforcement.applyEnforcement(user, action, { reason });
      await user.save();
      await db.ModerationLog.create({
        moderatorId: enforcementEngine.SYSTEM_MODERATOR_ID,
        targetType: 'user',
        targetId: userId,
        action: 'pipeline_temp_ban',
        meta,
      }).catch(() => {});
      await writeAuditLog({
        action: 'USER_TEMP_BANNED',
        userId,
        reason: violation,
        actorId: enforcementEngine.SYSTEM_MODERATOR_ID,
        resourceType: 'User',
        resourceId: userId,
        meta,
      });
      break;
    case enforcement.ENFORCEMENT_ACTIONS.WARN:
      enforcement.applyEnforcement(user, action, { reason });
      await user.save();
      try {
        const { notifyUser } = require('../lib/notifyUser');
        await notifyUser(userId, {
          type: 'moderation_warning',
          title: 'Content warning',
          body: 'A recent message was flagged by automated review.',
          meta,
        });
      } catch { /* optional */ }
      await db.ModerationLog.create({
        moderatorId: enforcementEngine.SYSTEM_MODERATOR_ID,
        targetType: 'user',
        targetId: userId,
        action: 'pipeline_warn',
        meta,
      }).catch(() => {});
      await writeAuditLog({
        action: 'USER_MODERATION_WARNED',
        userId,
        reason: violation,
        actorId: enforcementEngine.SYSTEM_MODERATOR_ID,
        resourceType: 'User',
        resourceId: userId,
        meta,
      });
      break;
    default:
      break;
  }
}

async function start(opts = {}) {
  if (!kafka.isEnabled() || !isPipelineEnforcementEnabled()) {
    opts.log?.info?.('[moderationResultsEnforcement] Skipped (Kafka off or MODERATION_RESULTS_ENFORCEMENT=false)');
    return { consumer: null };
  }

  const groupId =
    process.env.KAFKA_MODERATION_RESULTS_GROUP_ID || 'millo-moderation-results-enforcement';
  const topics = [kafka.TOPICS.MODERATION_RESULTS];

  const { consumer, run } = await kafka.startConsumer(groupId, topics, handleResult, {
    fromBeginning: false,
    log: opts.log || console,
  });

  _consumer = consumer;
  if (run) run.catch(() => {});

  opts.log?.info?.({ groupId, topics }, '[moderationResultsEnforcement] Started');
  return { consumer };
}

async function stop() {
  if (_consumer) {
    try {
      await _consumer.disconnect();
    } catch { /* ignore */ }
    _consumer = null;
  }
}

module.exports = { start, stop, handleResult, isPipelineEnforcementEnabled };
