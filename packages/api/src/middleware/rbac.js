/**
 * RBAC preHandler — role-gated routes (Fastify).
 *
 * Assumes `request.user` is populated by `middleware/auth.middleware`.
 * Mirrors the Express-style semantics from the request:
 *   if !req.user OR req.user.role !== role => 403 { error: 'FORBIDDEN' }
 */
'use strict';

function requireRole(role) {
  return async function rbacPreHandler(request, reply) {
    const user = request.user;
    if (!user || user.role !== role) {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
  };
}

module.exports = { requireRole };

