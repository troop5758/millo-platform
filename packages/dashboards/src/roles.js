/**
 * RBAC — role-based access. Enforced for all dashboard actions.
 * https://milloapp.com
 */
const ROLES = {
  admin: ['admin'],
  mod: ['admin', 'mod'],
  support: ['admin', 'mod', 'support'],
  creator: ['admin', 'creator'],
  /** Ops + support + admin may flip operational feature toggles (POST /admin/feature-toggle). */
  ops: ['admin', 'ops'],
};

/** Exact role match for operational toggles (not hierarchical). */
const FEATURE_TOGGLE_ROLES = Object.freeze(['admin', 'support', 'ops']);

function hasRole(user, role) {
  if (!user) return false;
  const userRole = typeof user === 'object' && user.role != null ? user.role : 'user';
  const allowed = ROLES[role];
  if (!allowed) return false;
  return allowed.includes(userRole);
}

function hasFeatureToggleAccess(user) {
  if (!user?.role) return false;
  return FEATURE_TOGGLE_ROLES.includes(user.role);
}

function requireFeatureToggleAccess(user) {
  if (!hasFeatureToggleAccess(user)) throw new Error('FORBIDDEN');
}

function requireRole(user, role) {
  if (!hasRole(user, role)) throw new Error('FORBIDDEN');
  return true;
}

function requireAdmin(user) {
  return requireRole(user, 'admin');
}

function requireMod(user) {
  return requireRole(user, 'mod');
}

function requireSupport(user) {
  return requireRole(user, 'support');
}

module.exports = {
  hasRole,
  requireRole,
  requireAdmin,
  requireMod,
  requireSupport,
  ROLES,
  FEATURE_TOGGLE_ROLES,
  hasFeatureToggleAccess,
  requireFeatureToggleAccess,
};
