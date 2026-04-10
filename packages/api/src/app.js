/**
 * Fastify bootstrap — Millo API. Phase 20: CSP, HSTS, rate limiting, CORS, Helmet.
 * Express equivalents: `helmet()` → @fastify/helmet; `express-rate-limit` → @fastify/rate-limit
 * (see @millo/security getRateLimitConfig). Redis-backed when REDIS_URL / REDIS_HOST is set.
 * Includes: X-Request-Id tracing, Content-Type enforcement on mutation endpoints.
 * https://milloapp.com
 */
const crypto   = require('crypto');
const fastify = require('fastify');
const security = require('@millo/security');
const APP_VERSION = process.env.APP_VERSION || '3.0.0';
const GIT_COMMIT = process.env.GIT_COMMIT || 'unknown';
const BUILD_DATE = process.env.BUILD_DATE || null;

/** Pino options — redact secrets from request logs (enterprise logging baseline). */
function createLoggerOptions(override) {
  if (override === false) return false;
  const level =
    process.env.LOG_LEVEL
    || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  const base = {
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-captcha-token"]',
        'req.headers["x-api-key"]',
        'req.headers["x-webhook-signature"]',
      ],
      censor: '[Redacted]',
    },
  };
  if (override && typeof override === 'object') {
    return { ...base, ...override, redact: override.redact || base.redact };
  }
  return base;
}

async function build(opts = {}) {
  const trustProxy =
    process.env.TRUST_PROXY === 'true'
    || process.env.BEHIND_PROXY === 'true'
    || process.env.TRUST_PROXY === '1';
  const logger = opts.logger !== undefined ? createLoggerOptions(opts.logger) : createLoggerOptions();
  const { logger: _dropLogger, ...restOpts } = opts;
  const app = fastify({ logger, trustProxy, ...restOpts });

  // Email is validated after Mongo + platform settings sync (see packages/api/src/index.js).

  // Kubernetes/orchestrator liveness — no dependency checks.
  app.get('/health/live', async (_req, reply) =>
    reply.send({
      status: 'live',
      uptime: process.uptime(),
      ts: new Date().toISOString(),
    }));

  // Readiness — MongoDB driver connection (fast gate before heavy /health dashboard).
  app.get('/health/ready', async (_req, reply) => {
    const mongoose = require('mongoose');
    const state = mongoose.connection.readyState;
    const ok = state === 1;
    return reply.status(ok ? 200 : 503).send({
      status: ok ? 'ready' : 'not_ready',
      mongo: ok ? 'connected' : `state_${state}`,
      ts: new Date().toISOString(),
    });
  });

  // Health dashboard — DB, Redis, Kafka, storage, AI services, economy, notifications
  app.get('/health', async (_req, reply) => {
    const healthDashboard = require('./services/healthDashboard');
    const { healthy, checks, criticalOk } = await healthDashboard.getHealthDashboard();
    const status = criticalOk ? 200 : 503;
    return reply.status(status).send({
      status: healthy ? 'ok' : 'degraded',
      ok: healthy,
      criticalOk,
      uptime: process.uptime(),
      appVersion: APP_VERSION,
      gitCommit: GIT_COMMIT,
      buildDate: BUILD_DATE,
      build: {
        appVersion: APP_VERSION,
        gitCommit: GIT_COMMIT,
        buildDate: BUILD_DATE,
      },
      checks,
      ts: new Date().toISOString(),
    });
  });

  // Runtime infra truth (public) — Prometheus/docs drift; use for feature gates + ops.
  app.get('/api/system/capabilities', async (_req, reply) => {
    const { getSystemCapabilities } = require('./services/systemCapabilities');
    return reply.send(await getSystemCapabilities());
  });
  app.get('/system/capabilities', async (_req, reply) => {
    const { getSystemCapabilities } = require('./services/systemCapabilities');
    return reply.send(await getSystemCapabilities());
  });

  const { blockPaymentRoutesWithoutStripe } = require('./middleware/paymentCapabilitiesGuard');
  app.addHook('onRequest', blockPaymentRoutesWithoutStripe);

  const { createAuthMiddleware } = require('./middleware/auth.middleware');
  const { createZeroTrustDeviceFingerprintHook } = require('./middleware/zeroTrustDeviceFingerprint');
  const { createRegionResolver } = require('./middleware/regionResolver');
  app.addHook('onRequest', createAuthMiddleware());
  app.addHook('onRequest', createZeroTrustDeviceFingerprintHook());
  app.addHook('onRequest', createRegionResolver());

  // Phase 20: Strict CORS — SPA (milloapp.com) → API (api.milloapp.com); credentials for future cookies.
  // Session cookie defaults: packages/api/src/lib/crossOriginSessionCookies.js (SameSite=None; Secure in prod).
  const corsOrigin = process.env.CORS_ORIGIN || 'https://milloapp.com';
  const corsOrigins = corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  await app.register(require('@fastify/cors'), {
    origin: corsOrigins.length > 1 ? corsOrigins : corsOrigins[0] || true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cookie',
      'X-Request-Id',
      'X-User-Id',
      'X-User-Role',
      'X-Client',
      'X-Device-Fingerprint',
      'X-Millo-Device-Fingerprint',
      'X-Session-Events',
    ],
  });

  const rateLimitConfig = security.getRateLimitConfig();
  const rateLimitOpts = {
    max: rateLimitConfig.max,
    timeWindow: rateLimitConfig.timeWindow,
  };
  // @fastify/rate-limit v9+ expects `store` to be a constructor when using a custom store.
  // Use the plugin's built-in Redis integration when REDIS_* is set (same ioredis client as elsewhere).
  const { isRedisRateLimitEnabled, getRedis } = require('./lib/rateLimitRedisStore');
  if (isRedisRateLimitEnabled()) {
    rateLimitOpts.redis = getRedis();
    rateLimitOpts.nameSpace = 'millo-rate-limit-';
  }
  await app.register(require('@fastify/rate-limit'), {
    ...rateLimitOpts,
    // Standard headers for rate-limit responses (helps clients and intermediaries).
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
  // Helmet: enable security headers. The API is JSON-only so the CSP and HSTS
  // are set below via the onSend hook (using the @millo/security module) which
  // allows environment-specific overrides. Helmet's own CSP and HSTS are
  // disabled here to avoid duplicate headers.
  await app.register(require('@fastify/helmet'), {
    contentSecurityPolicy: false,  // set per-response in onSend hook below
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: false,                   // set per-response in onSend hook below
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xContentTypeOptions: true,
    xFrameOptions: { action: 'deny' },
    xXssProtection: true,
    xDownloadOptions: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: false,
    dnsPrefetchControl: { allow: false },
  });
  await app.register(require('@fastify/websocket'));
  await app.register(require('@fastify/multipart'), {
    limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  });

  // Assign a unique X-Request-Id to every incoming request for distributed tracing
  app.addHook('onRequest', (request, reply, done) => {
    const reqId = request.headers['x-request-id'] || crypto.randomUUID();
    request.requestId = reqId;
    reply.header('X-Request-Id', reqId);
    done();
  });

  // Enforce Content-Type: application/json on mutation endpoints (POST/PUT/PATCH),
  // except payment webhooks (which receive raw body) and multipart uploads.
  app.addHook('preHandler', (request, reply, done) => {
    const method = request.method;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const ct = (request.headers['content-type'] || '').toLowerCase();
      const path = (request.url || '').split('?')[0];
      const isStripeWebhook  = path === '/payments/webhooks/stripe' || path === '/webhooks/stripe';
      const isPayPalWebhook  = path === '/payments/webhooks/paypal';
      const isWiseWebhook    = path === '/payments/webhooks/wise' || path === '/webhooks/wise';
      const isMultipart      = ct.includes('multipart/form-data');
      const isFormUrlEncoded = ct.includes('application/x-www-form-urlencoded');
      if (!isStripeWebhook && !isPayPalWebhook && !isWiseWebhook && !isMultipart && !isFormUrlEncoded && ct && !ct.includes('application/json')) {
        return reply.status(415).send({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' });
      }
    }
    done();
  });

  app.addHook('onSend', (_request, reply, _payload, done) => {
    reply.header('Content-Security-Policy', security.getCSPHeader());
    reply.header('Strict-Transport-Security', security.getHSTSHeader());
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
    reply.header('X-Millo-API-Version', APP_VERSION);
    if (GIT_COMMIT && GIT_COMMIT !== 'unknown') reply.header('X-Millo-Git-Commit', GIT_COMMIT);
    done();
  });
  return app;
}

module.exports = { build };
