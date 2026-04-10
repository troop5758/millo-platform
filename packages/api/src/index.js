/**
 * Millo API — Fastify bootstrap
 * Config loader, global error handler, health route. https://milloapp.com
 */

// Load .env from repo root (before any other requires)
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

// Non-production: allow API to boot without mail config (logs to console). Production must set EMAIL_PROVIDER in .env.
if (process.env.NODE_ENV !== 'production') {
  const ep = process.env.EMAIL_PROVIDER;
  if (ep == null || !String(ep).trim()) {
    process.env.EMAIL_PROVIDER = 'console';
  }
}

// Validate environment variables FIRST — prevents dev stubs in production
const { validateEnv: validateProductionEnv } = require('./bootstrap/validateEnv');
validateProductionEnv();
const { productionGuard: runHardProductionEnvGuard } = require('./middleware/productionGuard');
runHardProductionEnvGuard();

// Validate OAuth configuration and log status
try {
  const oauthProviders = require('./services/oauthProviders');
  oauthProviders.validateOAuthConfig({ log: console });
} catch (e) {
  console.warn('[OAuth] Validation failed:', e.message);
}

// Sentry error monitoring for the API — only active when DSN is configured
if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV || 'production',
    release:          process.env.APP_VERSION || '3.0.0',
    tracesSampleRate: 0.05, // 5% of API transactions
    beforeSend(event) {
      // Strip sensitive headers
      if (event.request?.headers) {
        if (event.request.headers.authorization) event.request.headers.authorization = '[Filtered]';
        if (event.request.headers.cookie)        event.request.headers.cookie = '[Filtered]';
      }
      return event;
    },
  });
  // Expose for use in error handler
  global.__sentry = Sentry;
}

const { load } = require('./config');
const { runProductionGuard } = require('./core/productionGuard');
const { build } = require('./app');
const { pricing } = require('@millo/economy');
const { levelTrustRoutes } = require('./routes/levelTrust');
const { liveRoutes, liveWebSocket, ingestRoutes, auctionWebSocket, meetingWebSocket } = require('./routes/live');
const { dashboardsRoutes } = require('./routes/dashboards');
const { complianceRoutes } = require('./routes/compliance');
const { tvRoutes } = require('./routes/tv');
const { notificationsRoutes } = require('./routes/notifications');
const { observationRoutes } = require('./routes/observation');
const { securityRoutes } = require('./routes/security');
const { behaviorRoutes } = require('./routes/behavior');
const { deviceRoutes } = require('./routes/device');
const { authRoutes } = require('./routes/auth');
const { profileRoutes } = require('./routes/profile');
const { economyRoutes } = require('./routes/economy');
const { dmRoutes }      = require('./routes/dm');
const { pricingRoutes } = require('./routes/pricing');
const { contentRoutes } = require('./routes/content');
const { creatorsRoutes } = require('./routes/creators');
const { paymentsRoutes } = require('./routes/payments');
const { payoutRoutes } = require('./routes/payout');
const { shopRoutes } = require('./routes/shop');
const { userWsRoutes }      = require('./routes/userWs');
const { moderationRoutes }  = require('./routes/moderation');
const { adsRoutes }         = require('./routes/ads');
const { marketingRoutes }   = require('./routes/marketing');
const { fraudRoutes }       = require('./routes/fraud');
const { analyticsRoutes }   = require('./routes/analytics');
const { adminRevenueRoutes } = require('./routes/adminRevenue');
const { metricsRoutes }     = require('./routes/metrics');
const { adminMetricsRoutes } = require('./routes/admin.metrics');
const { adminMetricsWsRoutes, startAdminMetricsPushLoop } = require('./routes/adminMetricsWs');
const { ppvRoutes }         = require('./routes/ppv');
const { monetizationRoutes } = require('./routes/monetization');
const { disputesRoutes }   = require('./routes/disputes');
const { supportRoutes }    = require('./routes/support');
const { voiceRoutes }      = require('./routes/voice');
const { aiRoutes }         = require('./routes/ai');
const { legalRoutes }      = require('./routes/legal');
const { musicRoutes }      = require('./routes/music');
const { mlRoutes }        = require('./routes/ml');
const { subscriptionsRoutes } = require('./routes/subscriptions');
const { discoveryRoutes } = require('./routes/discovery');
const { feedRoutes } = require('./routes/feed');
const { platformSurfaceRoutes } = require('./routes/platformSurfaceRoutes');
const { systemRoutes } = require('./routes/system');
const { internalRoutes } = require('./routes/internal');
const { adminConfigRoutes } = require('./routes/adminConfig');
const { adminDevicesRoutes } = require('./routes/admin.devices');
const db = require('@millo/database');
const tv = require('@millo/tv');
const { ensureInitialAdmin } = require('./bootstrap/initialAdmin');
const { ensureDefaultMusicLicenses } = require('./bootstrap/musicLicenses');

const start = async () => {
  const config = load();
  await db.connect();
  try {
    const dashboards = require('@millo/dashboards');
    if (typeof dashboards.hydrateFeatureTogglesFromDb === 'function') {
      await dashboards.hydrateFeatureTogglesFromDb();
    }
  } catch (e) {
    console.warn('[feature toggles] hydrate skipped:', e.message);
  }
  await ensureInitialAdmin(console);
  await ensureDefaultMusicLicenses(console);
  await pricing.loadFromDb(); // hydrate pricing cache from DB

  try {
    const { syncAndReloadEmailFromDatabase } = require('./services/emailRuntimeSync');
    await syncAndReloadEmailFromDatabase(console);
  } catch (e) {
    console.error('[BOOT] Email configuration:', e.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
    console.warn('[BOOT] Continuing in development — fix Email Service in Admin → System Config or .env');
  }

  // Stripe/OAuth/email sanity — after platform email sync so guard sees dashboard-selected provider.
  runProductionGuard();

  const app = await build();
  await systemRoutes(app);
  await internalRoutes(app);
  // Phase 12: TV clients read-only — no purchases; only GET to allowed paths + POST /tv/pairing/link
  app.addHook('onRequest', (request, reply, done) => {
    const req = { method: request.method, url: request.url, headers: request.headers };
    const { allowed, reason } = tv.enforceReadOnly(req);
    if (!allowed) return reply.status(403).send({ error: reason || 'TV_READ_ONLY' });
    done();
  });
  await levelTrustRoutes(app);
  await liveRoutes(app);
  await liveWebSocket(app);
  await auctionWebSocket(app);
  await meetingWebSocket(app);
  await ingestRoutes(app);
  await dashboardsRoutes(app);
  await complianceRoutes(app);
  await tvRoutes(app);
  await notificationsRoutes(app);
  await observationRoutes(app);
  await securityRoutes(app);
  await behaviorRoutes(app);
  await deviceRoutes(app);
  await authRoutes(app);
  await profileRoutes(app);
  await economyRoutes(app);
  await dmRoutes(app);
  await pricingRoutes(app);
  await contentRoutes(app);
  await creatorsRoutes(app);
  await paymentsRoutes(app);
  const { paymentsModule } = require('./payments');
  await paymentsModule(app);
  await payoutRoutes(app);
  await shopRoutes(app);
  await userWsRoutes(app);
  await moderationRoutes(app);
  await adsRoutes(app);
  await marketingRoutes(app);
  await fraudRoutes(app);
  await analyticsRoutes(app);
  await adminRevenueRoutes(app);
  await metricsRoutes(app);
  await adminMetricsRoutes(app);
  await adminMetricsWsRoutes(app);
  await ppvRoutes(app);
  await monetizationRoutes(app);
  await disputesRoutes(app);
  await supportRoutes(app);
  await aiRoutes(app);
  await voiceRoutes(app);
  await legalRoutes(app);
  await musicRoutes(app);
  await mlRoutes(app);
  await subscriptionsRoutes(app);
  await discoveryRoutes(app);
  await feedRoutes(app);
  await platformSurfaceRoutes(app);
  await adminConfigRoutes(app);
  await adminDevicesRoutes(app);

  // Global error handler — Sentry, structured log, no stack/verbose leaks in production.
  app.setErrorHandler((error, request, reply) => {
    if (error && (error.name === 'SystemDisabledError' || error.code === 'SYSTEM_CAPABILITY_DISABLED')) {
      const status = error.statusCode || 503;
      return reply.status(status).send({
        error: 'SYSTEM_CAPABILITY_DISABLED',
        code: 'SYSTEM_CAPABILITY_DISABLED',
        capability: error.capability,
        mode: error.mode,
        message: error.message || 'Capability not available',
        statusCode: status,
        ...(request.requestId ? { requestId: request.requestId } : {}),
      });
    }

    if (error && (error.name === 'FinancialIntegrityError' || error.code === 'PAYMENTS_NOT_LIVE')) {
      const status = error.statusCode || 503;
      return reply.status(status).send({
        error: error.code || 'FINANCIAL_INTEGRITY',
        code: error.code || 'FINANCIAL_INTEGRITY',
        message: error.message || 'Financial operation not allowed',
        statusCode: status,
        ...(request.requestId ? { requestId: request.requestId } : {}),
      });
    }

    if (error && error.code === 'PAYMENT_PROVIDER_NOT_LIVE') {
      const status = error.statusCode || 503;
      return reply.status(status).send({
        error: 'PAYMENT_PROVIDER_NOT_LIVE',
        code: 'PAYMENT_PROVIDER_NOT_LIVE',
        message: error.message || 'Payment provider not live',
        statusCode: status,
        ...(request.requestId ? { requestId: request.requestId } : {}),
      });
    }

    if (error && error.code === 'IDEMPOTENT_REPLAY') {
      return reply.status(409).send({
        error: 'IDEMPOTENT_REPLAY',
        code: 'IDEMPOTENT_REPLAY',
        message: error.message || 'A prior attempt with this idempotency key failed.',
        ...(request.requestId ? { requestId: request.requestId } : {}),
      });
    }

    if (error && (error.name === 'IdentityProviderError' || error.code === 'IDENTITY_OAUTH_NOT_LIVE')) {
      const status = error.statusCode || 403;
      return reply.status(status).send({
        error: error.code || 'IDENTITY_OAUTH_NOT_LIVE',
        code: error.code || 'IDENTITY_OAUTH_NOT_LIVE',
        message: error.message || 'OAuth identity provider is not available',
        provider: error.provider,
        status: error.status,
        ...(request.requestId ? { requestId: request.requestId } : {}),
      });
    }

    const status = error.statusCode != null ? error.statusCode : 500;
    const isProd = process.env.NODE_ENV === 'production';

    if (global.__sentry && status >= 500) {
      global.__sentry.withScope((scope) => {
        scope.setTag('route', request.url);
        scope.setExtra('method', request.method);
        if (request.requestId) scope.setTag('requestId', String(request.requestId));
        global.__sentry.captureException(error);
      });
    }

    app.log.error(
      { err: error, statusCode: status, requestId: request.requestId, url: request.url },
      error.message || 'request_error'
    );

    const clientCode =
      error.code && typeof error.code === 'string' && !String(error.code).includes(' ')
        ? error.code
        : undefined;
    let message = error.message || 'Internal Server Error';
    if (isProd && status >= 500) {
      message = 'Internal Server Error';
    }

    /** Stable machine-readable code for clients and ops (plus legacy `error` string). */
    function deriveErrorCode() {
      const c = error.code;
      if (
        typeof c === 'string'
        && /^[A-Z][A-Z0-9_]*$/.test(c)
        && c.length <= 96
      ) {
        return c;
      }
      if (status >= 500) return 'INTERNAL_ERROR';
      if (status === 400) return 'BAD_REQUEST';
      if (status === 401) return 'UNAUTHORIZED';
      if (status === 403) return 'FORBIDDEN';
      if (status === 404) return 'NOT_FOUND';
      if (status === 409) return 'CONFLICT';
      if (status === 415) return 'UNSUPPORTED_MEDIA_TYPE';
      if (status === 429) return 'TOO_MANY_REQUESTS';
      if (status >= 400) return 'CLIENT_ERROR';
      return 'INTERNAL_ERROR';
    }
    const code = deriveErrorCode();

    const body = {
      error: clientCode || message,
      code,
      message,
      statusCode: status,
    };
    if (request.requestId) body.requestId = request.requestId;
    if (!isProd && status >= 500 && error.stack) {
      body.detail = error.stack;
    }
    reply.status(status).send(body);
  });

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    if (global.__sentry) global.__sentry.captureException(err);
    app.log.error(err);
    process.exit(1);
  }

  startAdminMetricsPushLoop(app.log);

  // Phase 4: Redis viewer count → Mongo sync (periodic)
  try {
    const viewerSyncWorker = require('./workers/viewerSyncWorker');
    viewerSyncWorker.start(45 * 1000);
  } catch (e) {
    app.log.warn({ err: e }, 'viewerSyncWorker not started');
  }

  // Phase 5: Auction payment deadline (MANDATORY in production) — expired + unpaid → reassignWinner + penalizeUser
  const auctionWorkerDisabled = process.env.COMMERCE_DISABLE_AUCTION_PAYMENT_WORKER === 'true';
  if (!auctionWorkerDisabled) {
    try {
      const auctionDeadlineWorker = require('./workers/auctionDeadlineWorker');
      const intervalMs = Number(process.env.AUCTION_PAYMENT_WORKER_INTERVAL_MS) || 15 * 60 * 1000;
      await auctionDeadlineWorker.start(intervalMs);
    } catch (e) {
      if (process.env.NODE_ENV === 'production') {
        app.log.fatal({ err: e }, 'auctionDeadlineWorker failed — required in production (set COMMERCE_DISABLE_AUCTION_PAYMENT_WORKER=true only for explicit local override)');
        process.exit(1);
      }
      app.log.warn({ err: e }, 'auctionDeadlineWorker not started');
    }
  } else if (process.env.NODE_ENV === 'production') {
    app.log.warn('COMMERCE_DISABLE_AUCTION_PAYMENT_WORKER=true — auction payment enforcement worker is OFF (not recommended for production)');
  }

  // SLA monitor — overdue response/resolution due, escalate and notify admins
  try {
    const slaMonitorWorker = require('./workers/slaMonitor.worker');
    const slaIntervalMs = Number(process.env.SUPPORT_SLA_MONITOR_INTERVAL_MS) || 5 * 60 * 1000;
    slaMonitorWorker.start(slaIntervalMs, app.log);
  } catch (e) {
    app.log.warn({ err: e }, 'slaMonitor worker not started');
  }

  // Bot detection enforcement pipeline (BullMQ)
  try {
    const botDetectionWorker = require('./workers/botDetectionWorker');
    botDetectionWorker.start(app.log);
  } catch (e) {
    app.log.warn({ err: e }, 'botDetectionWorker not started');
  }

  // Event bus: Start all consumers via orchestrator (analytics, notifications, moderation, fraud, abuse)
  try {
    const orchestrator = require('./workers/eventBusOrchestrator');
    const kafka = require('./services/kafkaEventBus');

    // Ensure topics exist before starting consumers
    if (kafka.isEnabled()) {
      kafka.ensureTopics().then((r) => {
        if (r.created?.length) app.log.info({ topics: r.created }, 'Kafka topics created');
      }).catch((e) => app.log.warn({ err: e }, 'Failed to ensure Kafka topics'));
    }

    // Start all event bus consumers
    orchestrator.startAll({ log: app.log }).then((result) => {
      if (result.started?.length) {
        app.log.info({ consumers: result.started }, 'Event bus consumers started');
      }
      if (result.failed?.length) {
        app.log.warn({ consumers: result.failed }, 'Some event bus consumers failed to start');
      }
    }).catch((e) => app.log.warn({ err: e }, 'Event bus orchestrator startup failed'));
  } catch (e) {
    app.log.warn({ err: e }, 'Event bus orchestrator not started');
  }

  // Trust score history snapshots (admin timeline)
  try {
    const trustSnapshotWorker = require('./workers/trustSnapshotWorker');
    trustSnapshotWorker.start();
  } catch (e) {
    app.log.warn({ err: e }, 'trustSnapshotWorker not started');
  }

  // Engagement velocity detection (view spike → flag content)
  try {
    const engagementVelocityWorker = require('./workers/engagementVelocityWorker');
    engagementVelocityWorker.start(undefined, app.log);
  } catch (e) {
    app.log.warn({ err: e }, 'engagementVelocityWorker not started');
  }

  // Trend manipulation detection (low creator diversity, geo cluster)
  try {
    const trendManipulationWorker = require('./workers/trendManipulationWorker');
    trendManipulationWorker.start(undefined, app.log);
  } catch (e) {
    app.log.warn({ err: e }, 'trendManipulationWorker not started');
  }

  // Gift ring detection (A→B→C→A graph pattern)
  try {
    const giftRingDetectionWorker = require('./workers/giftRingDetectionWorker');
    giftRingDetectionWorker.start(undefined, app.log);
  } catch (e) {
    app.log.warn({ err: e }, 'giftRingDetectionWorker not started');
  }

  // Creator revenue velocity (revenue spike) detection
  try {
    const creatorRevenueVelocityWorker = require('./workers/creatorRevenueVelocityWorker');
    creatorRevenueVelocityWorker.start(undefined, app.log);
  } catch (e) {
    app.log.warn({ err: e }, 'creatorRevenueVelocityWorker not started');
  }

  // Monetization risk alerts (chargeback rate check)
  try {
    const monetizationRiskAlertWorker = require('./workers/monetizationRiskAlertWorker');
    monetizationRiskAlertWorker.start(undefined, app.log);
  } catch (e) {
    app.log.warn({ err: e }, 'monetizationRiskAlertWorker not started');
  }

  // Graceful shutdown: finish in-flight requests before exit
  const shutdown = async (signal) => {
    app.log.info(`Received ${signal} — shutting down gracefully…`);
    try {
      try { require('./workers/viewerSyncWorker').stop(); } catch {}
      try { require('./workers/auctionDeadlineWorker').stop(); } catch {}
      try { await require('./workers/botDetectionWorker').stop(); } catch {}
      // Stop all event bus consumers via orchestrator
      try { await require('./workers/eventBusOrchestrator').stopAll({ log: app.log }); } catch {}
      try { require('./workers/trustSnapshotWorker').stop(); } catch {}
      try { require('./workers/engagementVelocityWorker').stop(); } catch {}
      try { require('./workers/trendManipulationWorker').stop(); } catch {}
      try { require('./workers/giftRingDetectionWorker').stop(); } catch {}
      try { require('./workers/creatorRevenueVelocityWorker').stop(); } catch {}
      try { require('./workers/monetizationRiskAlertWorker').stop(); } catch {}
      await app.close();
      try {
        await db.disconnect();
      } catch (e) {
        app.log.warn({ err: e }, 'Mongo disconnect during shutdown');
      }
      app.log.info('Server closed. Exiting.');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
};

start().catch((err) => {
  // Include stack for easier debugging of boot-time constructor/import issues.
  console.error('[BOOT_VALIDATION_ERROR]', err?.message || err, '\n', err?.stack || '');
  process.exit(1);
});
