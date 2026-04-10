'use strict';
/**
 * Centralized JWT + session authentication middleware.
 * Validates Bearer token: JWT (when JWT_SECRET set) or session token.
 * Sets request.user to the resolved user (or null for unauthenticated).
 * https://milloapp.com
 */
const jwt = require('jsonwebtoken');
const db = require('@millo/database');
const { USER_ACCOUNT_STATUS, isAbuseEnforcementStatus } = require('@millo/shared').userAccountStatus;

const JWT_SECRET = process.env.JWT_SECRET;

function looksLikeJwt(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3 && /^[A-Za-z0-9_-]+$/.test(parts[0]) && /^[A-Za-z0-9_-]+$/.test(parts[1]);
}

function isUserBlocked(user) {
  if (!user) return false;
  const s = user.status || USER_ACCOUNT_STATUS.ACTIVE;
  if (isAbuseEnforcementStatus(s)) return true;
  if (user.flags?.suspended === true) return true;
  return false;
}

const BLOCKED_USER_ALLOWED_PATHS = [
  '/auth/logout',
  '/auth/me',
  '/auth/verify-email',
  '/auth/resend-verification',
  '/health',
  '/api/system/capabilities',
  '/system/capabilities',
  '/api/system/providers',
  '/system/providers',
  '/api/auth/providers',
  '/auth/providers',
  '/api/live/status',
  '/live/status',
];

async function resolveSessionToken(token) {
  if (!token) return null;
  try {
    const session = await db.Session.findOne({
      token,
      expiresAt: { $gt: new Date() },
      revoked: { $ne: true },
    }).lean();
    if (!session) return null;
    const user = await db.User.findById(session.userId).lean();
    if (!user) return null;
    return { ...user, sessionId: session._id };
  } catch {
    return null;
  }
}

async function resolveJwtToken(token) {
  if (!JWT_SECRET || !token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.user_id || decoded.userId || decoded.sub;
    if (!userId) return null;
    const user = await db.User.findById(userId).lean();
    if (!user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Resolve user from Bearer token. Tries JWT first (if JWT_SECRET set and token looks like JWT),
 * then falls back to session token.
 */
async function authenticate(request) {
  const header = request.headers?.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  if (JWT_SECRET && looksLikeJwt(token)) {
    const user = await resolveJwtToken(token);
    if (user) return user;
  }

  return resolveSessionToken(token);
}

/**
 * Check if user has verified email. Supports both top-level emailVerified and legacy flags.emailVerified.
 */
function isEmailVerified(user) {
  if (!user) return false;
  if (user.emailVerified === true) return true;
  if (user.flags?.emailVerified === true) return true;
  return false;
}

/**
 * Fastify preHandler that requires authentication. Use on protected routes.
 * Returns 401 if no valid token or user.
 */
async function requireAuth(request, reply) {
  const user = await authenticate(request);
  if (!user) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid auth token' });
  }
  request.user = user;
}

/**
 * Fastify preHandler that requires verified email. Use after requireAuth on sensitive routes.
 * Returns 403 if not verified.
 */
function requireVerified(request, reply) {
  const user = request.user;
  if (!user) {
    return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid auth token' });
  }
  if (!isEmailVerified(user)) {
    return reply.status(403).send({
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email address to unlock this feature.',
    });
  }
}

/**
 * Helper for routes that use authUser(): check verified email, send 403 if not.
 * Returns false if not verified (caller should return), true if verified.
 */
function requireVerifiedUser(user, reply) {
  if (!user) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid auth token' });
    return false;
  }
  if (!isEmailVerified(user)) {
    reply.status(403).send({
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email address to unlock this feature.',
    });
    return false;
  }
  return true;
}

/**
 * Fastify onRequest hook — populates request.user for every request.
 * Blocks suspended/banned users with 403 on most routes (except logout, me, verify-email).
 */
function createAuthMiddleware() {
  return async function authMiddleware(request, reply) {
    request.user = await authenticate(request);
    if (request.user && isUserBlocked(request.user)) {
      const path = request.url?.split('?')[0] || '';
      const allowed = BLOCKED_USER_ALLOWED_PATHS.some((p) => path === p || path.endsWith(p));
      if (!allowed) {
        const status = request.user.status
          || (request.user.flags?.suspended ? USER_ACCOUNT_STATUS.SUSPENDED : USER_ACCOUNT_STATUS.ACTIVE);
        return reply.status(403).send({
          error: 'ACCOUNT_DISABLED',
          message: status === USER_ACCOUNT_STATUS.BANNED
            ? 'Your account has been permanently suspended.'
            : status === USER_ACCOUNT_STATUS.RESTRICTED
              ? 'Your account is restricted due to risk signals. Contact support if you believe this is an error.'
              : 'Your account has been suspended.',
          status,
          suspensionReason: request.user.suspensionReason || null,
        });
      }
    }
  };
}

module.exports = {
  authenticate,
  requireAuth,
  requireVerified,
  requireVerifiedUser,
  createAuthMiddleware,
  resolveSessionToken,
  resolveJwtToken,
  isUserBlocked,
  isEmailVerified,
};
