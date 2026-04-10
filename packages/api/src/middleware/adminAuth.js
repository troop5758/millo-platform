'use strict';
/**
 * Admin auth guard — Fastify preHandler + Express-style helper.
 *
 * Tutorial (Express):
 *   `export function requireAdmin(req, res, next) { … }`
 * Millo equivalent:
 *   `const { requireAdminExpress } = require('./adminAuth');`
 *   — same behavior: 403 + `{ error: 'Unauthorized' }` if `!req.user` or `req.user.role !== 'admin'`.
 *
 * Fastify routes should use `requireAdmin` (async): resolves user via Bearer / dev headers when `request.user` is unset.
 * https://milloapp.com
 */
const { authenticate } = require('./auth.middleware');

/**
 * Resolve user for admin routes (session/JWT from Bearer, then non-prod headers).
 * @param {import('fastify').FastifyRequest} request
 * @returns {Promise<object|null>}
 */
async function resolveAdminRequestUser(request) {
  if (request.user) return request.user;
  const fromBearer = await authenticate(request);
  if (fromBearer) return fromBearer;
  if (process.env.NODE_ENV !== 'production') {
    const id = request.headers['x-user-id'];
    const role = request.headers['x-user-role'] || 'user';
    if (id) return { _id: id, role };
  }
  return null;
}

/**
 * Fastify preHandler — use on admin routes:
 * `app.get('/admin/x', { preHandler: requireAdmin }, async (request, reply) => { ... })`
 * @type {import('fastify').preHandlerHookHandler}
 */
async function requireAdmin(request, reply) {
  const user = await resolveAdminRequestUser(request);
  if (!user || user.role !== 'admin') {
    return reply.status(403).send({ error: 'Unauthorized' });
  }
  request.user = user;
}

/**
 * Express middleware — same as common `requireAdmin(req, res, next)` snippets (this package is CommonJS, not ESM `export`).
 * Caller must attach `req.user` earlier (e.g. session/JWT middleware). Use for Express sub-apps or tests only.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireAdminExpress(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = {
  requireAdmin,
  requireAdminExpress,
  resolveAdminRequestUser,
};
