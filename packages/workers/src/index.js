/**
 * Millo Workers — BullMQ. Starts decay worker; DB connection for level-trust.
 * https://milloapp.com
 */

// Load .env from repo root
const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '../../..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      const val = m[2].replace(/^["']|["']$/g, '').trim();
      if (val) process.env[m[1]] = val;
    }
  }
}

const db = require('@millo/database');
const { paymentDeadlineQueue, scheduledStreamsQueue, streamReminderQueue, liveEventsQueue, dmTimeoutQueue, trendingSoundsQueue, earlyViralDetectionQueue, clusterPropagationQueue } = require('./queues');

// Sentry for workers (optional)
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      release: process.env.APP_VERSION || '3.0.0',
      tracesSampleRate: 0.02,
    });
    global.__workers_sentry = Sentry;
  } catch {}
}

async function start() {
  await db.connect();

  try {
    const emailRuntimeSync = require(path.join(__dirname, '..', '..', 'api', 'src', 'services', 'emailRuntimeSync'));
    await emailRuntimeSync.syncAndReloadEmailFromDatabase(console);
    console.info('[workers] Email settings synced from platform config (if any)');
  } catch (err) {
    console.warn('[workers] Email platform sync failed — using env only:', err?.message || err);
  }

  try {
    const dashboards = require('@millo/dashboards');
    if (typeof dashboards.hydrateFeatureTogglesFromDb === 'function') {
      await dashboards.hydrateFeatureTogglesFromDb();
      console.info('[workers] Feature toggles hydrated from PlatformSettings');
    }
  } catch (err) {
    console.warn('[workers] Feature toggles hydrate skipped:', err?.message || err);
  }

  if (process.env.MODERATION_KAFKA_WORKER === 'true') {
    try {
      const { startModerationKafkaWorker } = require('../moderation.worker');
      startModerationKafkaWorker().catch((err) => {
        console.error('[workers] moderation kafka worker failed', err);
      });
    } catch (err) {
      console.error('[workers] moderation kafka worker not started:', err?.message || err);
    }
  }

  if (process.env.FEATURES_KAFKA_WORKER === 'true') {
    try {
      const { startFeaturesKafkaWorker } = require('../features.worker');
      startFeaturesKafkaWorker().catch((err) => {
        console.error('[workers] features kafka worker failed', err);
      });
    } catch (err) {
      console.error('[workers] features kafka worker not started:', err?.message || err);
    }
  }

  require('./decay-worker');
  require('./payout-retry-worker');
  require('./paymentDeadline.worker');
  require('./startScheduledStreams.worker');
  require('./streamReminder.worker');
  require('./startLiveEvents.worker');
  require('./dmTimeout.worker');
  require('./fraudCheck.worker');
  require('./trackingSupport.worker');
  require('./composition.worker');
  require('./trendingSounds.worker');
  require('./earlyViralDetection.worker');
  require('./clusterPropagation.worker');
  require('./email.worker');
  require('./notifications.worker');

  // Schedule payment deadline enforcement every hour (auction winners must pay within 24h)
  await paymentDeadlineQueue.add('enforce', {}, { repeat: { every: 60 * 60 * 1000 } });
  // Schedule scheduled stream activation every minute
  await scheduledStreamsQueue.add('start', {}, { repeat: { every: 60 * 1000 } });
  // Schedule stream reminders (24h, 1h, 15min before) every 5 minutes
  await streamReminderQueue.add('remind', {}, { repeat: { every: 5 * 60 * 1000 } });
  // Schedule live event activation every minute
  await liveEventsQueue.add('start', {}, { repeat: { every: 60 * 1000 } });
  // Schedule DM timeout enforcement every 10 minutes (expire unpaid unlock messages)
  await dmTimeoutQueue.add('enforce', {}, { repeat: { every: 10 * 60 * 1000 } });
  // Trending sound leaderboard (ZSET trending_sounds, score = viral_score) — update every 5 minutes
  await trendingSoundsQueue.add('update', {}, { repeat: { every: 5 * 60 * 1000 } });
  // Run once on startup to populate leaderboard
  await trendingSoundsQueue.add('update', {}, { jobId: 'trending-sounds-bootstrap' }).catch(() => {});
  // Early viral detection — first 50–500 videos per sound; update viral_sound_candidates every 15 min
  await earlyViralDetectionQueue.add('update', {}, { repeat: { every: 15 * 60 * 1000 } });
  await earlyViralDetectionQueue.add('update', {}, { jobId: 'early-viral-bootstrap' }).catch(() => {});
  await clusterPropagationQueue.add('update', {}, { repeat: { every: 30 * 60 * 1000 } });
  await clusterPropagationQueue.add('update', {}, { jobId: 'cluster-propagation-bootstrap' }).catch(() => {});
}

start().catch((err) => {
  if (global.__workers_sentry) global.__workers_sentry.captureException(err);
  console.error('[workers] Failed to start', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  if (global.__workers_sentry) global.__workers_sentry.captureException(err);
});
process.on('uncaughtException', (err) => {
  if (global.__workers_sentry) global.__workers_sentry.captureException(err);
});
