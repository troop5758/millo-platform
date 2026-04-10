'use strict';
/**
 * Hard production env guard — exit before app listen if critical secrets are missing.
 * Complements bootstrap/validateEnv.js and core/productionGuard.js (provider checks).
 * https://milloapp.com
 */

function hasMongoUri() {
  const u = process.env.MONGO_URI || process.env.MONGODB_URI;
  return !!(u && String(u).trim());
}

function hasRedisUri() {
  return !!(
    (process.env.REDIS_URL && process.env.REDIS_URL.trim()) ||
    (process.env.REDIS_URI && process.env.REDIS_URI.trim()) ||
    (process.env.REDIS_HOST && String(process.env.REDIS_PORT || '').trim() !== '')
  );
}

/**
 * Call once after .env load, before DB and Fastify build.
 * In non-production, no-op.
 */
function productionGuard() {
  if (process.env.NODE_ENV !== 'production') return;

  const requiredString = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'JWT_SECRET',
  ];

  for (const key of requiredString) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      console.error(`[PRODUCTION GUARD] Missing ENV: ${key}`);
      process.exit(1);
    }
  }

  if (!hasMongoUri()) {
    console.error('[PRODUCTION GUARD] Missing ENV: MONGO_URI or MONGODB_URI');
    process.exit(1);
  }

  if (!hasRedisUri()) {
    console.error('[PRODUCTION GUARD] Missing ENV: REDIS_URL (or REDIS_URI / REDIS_HOST+REDIS_PORT)');
    process.exit(1);
  }

  console.log('[PRODUCTION GUARD] Hard env check passed');
}

module.exports = { productionGuard };
