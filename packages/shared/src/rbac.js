/**
 * RBAC primitives — Phase 1. No business logic, no controllers.
 * https://milloapp.com
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  MOD: 'mod',
  SUPPORT: 'support',
  USER: 'user',
});

function hasRole(user, role) {
  if (!user || typeof user !== 'object') return false;
  const r = user.role ?? user.roleId;
  if (!r) return false;
  const normalized = String(r).toLowerCase();
  const target = String(role).toLowerCase();
  return normalized === target;
}

function requireRole(user, role) {
  if (!hasRole(user, role)) {
    const err = new Error('FORBIDDEN');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = { ROLES, hasRole, requireRole };
