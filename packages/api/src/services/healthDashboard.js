'use strict';
/**
 * Health dashboard — checks for GET /health: DB, Redis, Kafka, storage, AI services.
 * https://milloapp.com
 */
const path = require('path');
const { getProductionTruth } = require(path.join(__dirname, '../../../../config/production-truth.js'));
async function checkDatabase() {
  try {
    const db = require('@millo/database');
    await db.ping?.();
    return { status: 'ok' };
  } catch (e) {
    return { status: 'error', message: e?.message || 'ping failed' };
  }
}

async function checkRedis() {
  try {
    const Redis = require('ioredis');
    const conn = process.env.REDIS_URL || { host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT) || 6379 };
    const redis = typeof conn === 'string' ? new Redis(conn) : new Redis(conn);
    await redis.ping();
    redis.disconnect();
    return { status: 'ok' };
  } catch (e) {
    return { status: 'error', message: e?.message || 'ping failed' };
  }
}

async function checkKafka() {
  try {
    const eventBus = require('./kafkaEventBus');
    if (!eventBus.isEnabled()) return { status: 'disabled' };
    const brokers = eventBus.getBrokers?.() || [];
    if (!brokers.length) return { status: 'unavailable', message: 'no brokers configured' };
    return { status: 'ok', brokers: brokers.length };
  } catch (e) {
    return { status: 'error', message: e?.message || 'check failed' };
  }
}

async function checkStorage() {
  const bucket = process.env.AWS_S3_BUCKET || process.env.STORAGE_BUCKET || process.env.MODERATION_S3_BUCKET;
  const hasAws = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  const hasR2 = process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID;
  if (!bucket && !hasAws && !hasR2) return { status: 'not_configured' };
  try {
    if (hasAws || hasR2) return { status: 'ok', backend: hasR2 ? 'r2' : 's3' };
    return { status: 'not_configured' };
  } catch (e) {
    return { status: 'error', message: e?.message };
  }
}

async function checkAIServices() {
  const openai = !!(process.env.AI_MODERATION_ENABLED === 'true' && process.env.OPENAI_API_KEY);
  const hive = !!(process.env.HIVE_API_KEY);
  const rekognition = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  return {
    status: openai || hive || rekognition ? 'ok' : 'not_configured',
    openai: openai ? 'configured' : 'off',
    hive: hive ? 'configured' : 'off',
    rekognition: rekognition ? 'configured' : 'off',
  };
}

async function checkEconomy() {
  try {
    const economy = require('@millo/economy');
    if (typeof economy.credit !== 'function' && typeof economy.getBalance !== 'function') throw new Error('not_loaded');
    return { status: 'ok' };
  } catch {
    return { status: 'unavailable' };
  }
}

async function checkNotifications() {
  try {
    const notif = require('@millo/notifications');
    if (typeof notif.sendEmail !== 'function' && typeof notif.sendPush !== 'function') throw new Error('not_loaded');
    const consoleOnly =
      typeof notif.isConsoleEmailTransport === 'function' ? notif.isConsoleEmailTransport() : false;
    const { getPushStatus } = require('../utils/providerStatus');
    const push = getPushStatus();
    if (consoleOnly && process.env.NODE_ENV === 'production') {
      return {
        status: 'misconfigured',
        message: 'console_email_in_production',
        push: push.mode,
      };
    }
    return { status: 'ok', consoleOnly, push: push.mode };
  } catch (e) {
    return { status: 'unavailable', message: e?.message };
  }
}

/**
 * Run all health checks and return dashboard. Critical: database, redis.
 */
async function getHealthDashboard() {
  const { getProviderStateSnapshot } = require('../lib/providerState');
  const { getTrustEnforcementSnapshot } = require('./trustEnforcement');
  const [database, redis, kafka, storage, aiServices, economy, notifications] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkKafka(),
    checkStorage(),
    checkAIServices(),
    checkEconomy(),
    checkNotifications(),
  ]);

  const checks = {
    database,
    redis,
    kafka,
    storage,
    ai_services: aiServices,
    economy,
    notifications,
    provider_states: getProviderStateSnapshot(),
    production_truth: getProductionTruth(),
    trust_enforcement: getTrustEnforcementSnapshot(),
  };

  const criticalOk = database.status === 'ok' && redis.status === 'ok';
  const healthy = criticalOk;

  return {
    healthy,
    checks,
    criticalOk,
  };
}

module.exports = {
  getHealthDashboard,
  checkDatabase,
  checkRedis,
  checkKafka,
  checkStorage,
  checkAIServices,
};
