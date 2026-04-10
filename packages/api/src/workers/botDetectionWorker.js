'use strict';
/**
 * Bot detection enforcement worker — BullMQ. Single entry: 'enforce' (unified engine).
 * Legacy: risk_score_update → enqueues 'enforce'; captcha_challenge, shadow_ban, permanent_ban still supported.
 * https://milloapp.com
 */
const { Worker } = require('bullmq');
const db = require('@millo/database');
const riskEngine = require('../services/riskEngine');
const riskEnforcementEngine = require('../services/riskEnforcementEngine');
const { getBotDetectionQueue, addBotDetectionJob, QUEUE_NAME } = require('../lib/botDetectionQueue');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const connection = { host: REDIS_HOST, port: REDIS_PORT };

// Legacy thresholds (used only when risk_score_update does not use unified engine)
const CAPTCHA_THRESHOLD = Number(process.env.BOT_ENFORCE_CAPTCHA_THRESHOLD) || 70;
const SHADOW_BAN_THRESHOLD = Number(process.env.BOT_ENFORCE_SHADOW_BAN_THRESHOLD) || 80;
const PERMANENT_BAN_THRESHOLD = Number(process.env.BOT_ENFORCE_PERMANENT_BAN_THRESHOLD) || 95;
const REQUIRE_CAPTCHA_TTL_SEC = Number(process.env.BOT_REQUIRE_CAPTCHA_TTL_SEC) || 24 * 60 * 60; // 24h
const USE_UNIFIED_ENFORCEMENT = process.env.ENFORCEMENT_USE_UNIFIED_ENGINE !== 'false';

let _worker = null;

/** Unified: run enforcement engine (bot + trust + fraud → single action). */
async function enforceJob(job) {
  const { userId, reason } = job.data || {};
  if (!userId) return { skipped: true, reason: 'no_userId' };
  const uid = String(userId);
  const result = await enforcementEngine.enforce(uid, { reason });
  return result;
}

async function riskScoreUpdate(job) {
  const { userId } = job.data || {};
  if (!userId) return;
  const uid = String(userId);
  if (USE_UNIFIED_ENFORCEMENT) {
    const { score, signals } = await riskEngine.calculateRisk(uid).catch(() => ({ score: 0, signals: [] }));
    const out = await riskEnforcementEngine.applyRiskEnforcement(uid, score, {
      source: 'bot_detection_risk_engine',
      meta: { signals },
    }).catch(() => ({ decision: 'ALLOW', applied: false }));
    return { score, signals, ...out };
  }
  const { score, signals } = await riskEngine.calculateRisk(uid);
  await riskEnforcementEngine.applyRiskEnforcement(uid, score, {
    source: 'bot_detection_risk_engine',
    meta: { signals },
  }).catch(() => {});
  await job.updateData({ ...job.data, lastScore: score, signals });
  if (score >= PERMANENT_BAN_THRESHOLD) {
    await addBotDetectionJob('permanent_ban', { userId: uid, reason: `Automated: risk score ${score}`, score, signals }, { delay: 0 });
  } else if (score >= SHADOW_BAN_THRESHOLD) {
    await addBotDetectionJob('shadow_ban', { userId: uid, reason: `Automated: risk score ${score}`, score, signals }, { delay: 0 });
  } else if (score >= CAPTCHA_THRESHOLD) {
    await addBotDetectionJob('captcha_challenge', { userId: uid, score, signals }, { delay: 0 });
  }
  return { score, signals };
}

async function captchaChallenge(job) {
  const { userId } = job.data || {};
  if (!userId) return;
  const { setRequireCaptcha } = require('../lib/requireCaptchaRedis');
  await setRequireCaptcha(String(userId), REQUIRE_CAPTCHA_TTL_SEC);
  return { ok: true };
}

async function shadowBan(job) {
  const { userId, reason } = job.data || {};
  if (!userId) return;
  const uid = userId.toString?.() || userId;
  await db.Moderation.findOneAndUpdate(
    { userId: uid },
    {
      $set: {
        shadowBanned: true,
        reason: (reason && String(reason).slice(0, 500)) || 'Automated enforcement',
        expiresAt: null,
        setAt: new Date(),
        setBy: null,
      },
    },
    { upsert: true, new: true }
  );
  await db.Profile.findOneAndUpdate({ userId: uid }, { $set: { shadowBanned: true } }, { upsert: true }).catch(() => {});
  await db.User.updateOne({ _id: uid }, { $set: { shadowBanned: true } }).catch(() => {});
  await db.AdminAuditLog.create({
    action: 'shadow_ban',
    adminId: null,
    targetType: 'Profile',
    targetId: uid,
    overrideReason: reason || null,
    meta: { userId: uid, source: 'bot_detection_worker' },
  }).catch(() => {});
  return { ok: true };
}

async function permanentBan(job) {
  const { userId, reason } = job.data || {};
  if (!userId) return;
  const uid = userId.toString?.() || userId;
  await db.User.updateOne(
    { _id: uid },
    {
      $set: {
        status: 'banned',
        suspensionReason: (reason && String(reason).slice(0, 500)) || 'Automated enforcement: high bot risk',
        'flags.suspended': true,
      },
    }
  ).catch(() => {});
  await db.AdminAuditLog.create({
    action: 'permanent_ban',
    adminId: null,
    targetType: 'User',
    targetId: uid,
    overrideReason: reason || null,
    meta: { userId: uid, source: 'bot_detection_worker' },
  }).catch(() => {});
  return { ok: true };
}

async function processJob(job) {
  const { name } = job;
  switch (name) {
    case 'enforce':
      return enforceJob(job);
    case 'risk_score_update':
      return riskScoreUpdate(job);
    case 'captcha_challenge':
      return captchaChallenge(job);
    case 'shadow_ban':
      return shadowBan(job);
    case 'permanent_ban':
      return permanentBan(job);
    default:
      return { skipped: true, reason: 'unknown_job_type' };
  }
}

function start(log = console) {
  if (_worker) return _worker;
  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      try {
        return await processJob(job);
      } catch (err) {
        log.error?.({ err, job: job?.name, jobId: job?.id }, 'BotDetectionWorker job failed');
        throw err;
      }
    },
    {
      connection,
      concurrency: 2,
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    }
  );
  _worker.on('failed', (job, err) => {
    log.warn?.({ jobId: job?.id, name: job?.name, err: err?.message }, 'BotDetectionWorker job failed');
  });
  log.info?.('BotDetectionWorker started');
  return _worker;
}

async function stop() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}

module.exports = { start, stop, addBotDetectionJob: require('../lib/botDetectionQueue').addBotDetectionJob };
