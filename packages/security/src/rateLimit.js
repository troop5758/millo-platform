/**
 * Rate limiting config — for @fastify/rate-limit.
 * Defaults mirror common Express `rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })`.
 * Override: RATE_LIMIT_MAX, RATE_LIMIT_TIME_WINDOW_MS.
 * https://milloapp.com
 */
const DEFAULT_MAX = 100;
const DEFAULT_TIME_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getRateLimitConfig() {
  return {
    max: Number(process.env.RATE_LIMIT_MAX) || DEFAULT_MAX,
    timeWindow: Number(process.env.RATE_LIMIT_TIME_WINDOW_MS) || DEFAULT_TIME_WINDOW_MS,
  };
}

module.exports = { getRateLimitConfig, DEFAULT_MAX, DEFAULT_TIME_WINDOW_MS };
