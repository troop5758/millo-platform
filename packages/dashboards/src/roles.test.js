/**
 * RBAC — enforce role checks. https://milloapp.com
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  hasRole,
  requireAdmin,
  requireMod,
  requireSupport,
  hasFeatureToggleAccess,
  requireFeatureToggleAccess,
} = require('./roles');

describe('roles', () => {
  it('hasRole: admin has admin', () => {
    assert.strictEqual(hasRole({ _id: 'a', role: 'admin' }, 'admin'), true);
  });
  it('hasRole: user does not have admin', () => {
    assert.strictEqual(hasRole({ _id: 'u', role: 'user' }, 'admin'), false);
  });
  it('hasRole: mod has mod', () => {
    assert.strictEqual(hasRole({ role: 'mod' }, 'mod'), true);
  });
  it('hasRole: admin has mod (elevated)', () => {
    assert.strictEqual(hasRole({ role: 'admin' }, 'mod'), true);
  });
  it('hasRole: support has support', () => {
    assert.strictEqual(hasRole({ role: 'support' }, 'support'), true);
  });
  it('hasRole: null user has no role', () => {
    assert.strictEqual(hasRole(null, 'admin'), false);
  });

  it('requireAdmin: throws for user', () => {
    assert.throws(() => requireAdmin({ role: 'user' }), /FORBIDDEN/);
  });
  it('requireAdmin: allows admin', () => {
    requireAdmin({ role: 'admin' });
  });
  it('requireMod: throws for user', () => {
    assert.throws(() => requireMod({ role: 'user' }), /FORBIDDEN/);
  });
  it('requireMod: allows mod and admin', () => {
    requireMod({ role: 'mod' });
    requireMod({ role: 'admin' });
  });
  it('requireSupport: allows support, mod, admin', () => {
    requireSupport({ role: 'support' });
    requireSupport({ role: 'mod' });
    requireSupport({ role: 'admin' });
  });
  it('requireSupport: throws for user', () => {
    assert.throws(() => requireSupport({ role: 'user' }), /FORBIDDEN/);
  });

  it('hasFeatureToggleAccess: admin, support, ops only', () => {
    assert.strictEqual(hasFeatureToggleAccess({ role: 'admin' }), true);
    assert.strictEqual(hasFeatureToggleAccess({ role: 'support' }), true);
    assert.strictEqual(hasFeatureToggleAccess({ role: 'ops' }), true);
    assert.strictEqual(hasFeatureToggleAccess({ role: 'mod' }), false);
    assert.strictEqual(hasFeatureToggleAccess({ role: 'user' }), false);
  });
  it('requireFeatureToggleAccess: throws for mod', () => {
    assert.throws(() => requireFeatureToggleAccess({ role: 'mod' }), /FORBIDDEN/);
  });
});
