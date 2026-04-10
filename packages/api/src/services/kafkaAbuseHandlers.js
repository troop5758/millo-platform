'use strict';
/**
 * Kafka abuse detection handlers — runBehaviorAnalysis, detectATO, detectGiftFraud, etc.
 * Invoked by kafkaAbuseConsumer for user_activity, auth_events, payments, live_events, moderation_events.
 * https://milloapp.com
 */

async function runBehaviorAnalysis(event) {
  const userId = event.userId || event.user_id;
  if (!userId) return;
  try {
    const { addBotDetectionJob } = require('../lib/botDetectionQueue');
    await addBotDetectionJob('risk_score_update', { userId: String(userId) }, { delay: 0 });
  } catch (_) {}
}

async function detectATO(event) {
  const userId = event.userId || event.user_id;
  if (!userId) return;
  const ip = event.ip || event.ipAddress;
  if (!ip) return;
  try {
    const accountTakeoverService = require('./accountTakeoverService');
    const geoService = require('./geoService');
    const geo = await geoService.lookupAsync(ip).catch(() => null);
    const newLogin = {
      ip,
      country: event.country ?? geo?.country ?? null,
      city: event.city ?? geo?.city ?? null,
      latitude: event.latitude ?? geo?.latitude ?? null,
      longitude: event.longitude ?? geo?.longitude ?? null,
      deviceFingerprint: event.deviceFingerprint || event.deviceId || null,
      userAgent: event.userAgent || null,
      createdAt: event.ts ? new Date(event.ts) : new Date(),
    };
    await accountTakeoverService.recordLoginAndCheckATO(userId, newLogin);
  } catch (_) {}
}

async function detectGiftFraud(event) {
  const ev = event.event || event.type;
  if (ev === 'gift.sent' || ev === 'gift_sent') {
    const userId = event.userId || event.senderId || event.user_id;
    const receiverId = event.receiverId || event.receiver_id;
    const amountCents = event.amountCents ?? event.cost ?? event.coins;
    if (!userId) return;
    try {
      const fraudService = require('./fraudService');
      const { riskScore } = await fraudService.evaluateGiftRisk(userId, {
        ip: event.ip,
        deviceFingerprint: event.deviceFingerprint,
      });
      if (riskScore >= 80) {
        const { addBotDetectionJob } = require('../lib/botDetectionQueue');
        await addBotDetectionJob('enforce', { userId: String(userId), reason: `Gift fraud risk ${riskScore}` }, { delay: 0 });
      }
    } catch (_) {}
    return;
  }
  if (ev === 'coins.purchased' || ev === 'payout.requested') {
    const userId = event.userId || event.user_id;
    if (!userId) return;
    try {
      const { addBotDetectionJob } = require('../lib/botDetectionQueue');
      await addBotDetectionJob('risk_score_update', { userId: String(userId) }, { delay: 0 });
    } catch (_) {}
  }
}

async function detectLiveAbuse(event) {
  const ev = event.event || event.type;
  if (ev === 'viewer.join' || ev === 'viewer.leave') {
    const streamId = event.streamId || event.stream_id;
    const userId = event.userId || event.viewerId;
    if (streamId && userId) {
      try {
        const { addBotDetectionJob } = require('../lib/botDetectionQueue');
        await addBotDetectionJob('risk_score_update', { userId: String(userId) }, { delay: 5000 });
      } catch (_) {}
    }
  }
}

async function handleModerationEvent(event) {
  const ev = event.event || event.type;
  if (ev === 'report.created') {
    const targetId = event.targetId || event.target_id;
    const reportId = event.reportId || event.report_id;
    if (targetId) {
      try {
        const { addBotDetectionJob } = require('../lib/botDetectionQueue');
        await addBotDetectionJob('risk_score_update', { userId: String(targetId) }, { delay: 0 });
      } catch (_) {}
    }
  }
}

module.exports = {
  runBehaviorAnalysis,
  detectATO,
  detectGiftFraud,
  detectLiveAbuse,
  handleModerationEvent,
};
