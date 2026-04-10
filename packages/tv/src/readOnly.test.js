/**
 * Read-only enforcement for TV clients. No purchases; GET-only to allowed paths.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  isTvClient,
  isAllowedPath,
  isReadOnlyRequest,
  enforceReadOnly,
} = require('./readOnly');

describe('readOnly', () => {
  it('isTvClient: true when X-Client is tv', () => {
    assert.strictEqual(isTvClient({ headers: { 'x-client': 'tv' } }), true);
    assert.strictEqual(isTvClient({ headers: { 'x-client': 'TV' } }), true);
  });
  it('isTvClient: false when X-Client is missing or not tv', () => {
    assert.strictEqual(isTvClient({ headers: {} }), false);
    assert.strictEqual(isTvClient({ headers: { 'x-client': 'web' } }), false);
  });

  it('isAllowedPath: /tv/* and /health allowed', () => {
    assert.strictEqual(isAllowedPath('/tv/channels'), true);
    assert.strictEqual(isAllowedPath('/tv/streams'), true);
    assert.strictEqual(isAllowedPath('/health'), true);
    assert.strictEqual(isAllowedPath('/tv/pairing/link'), true);
    assert.strictEqual(isAllowedPath('/live/stream/abc'), true);
    assert.strictEqual(isAllowedPath('/discovery/feed'), true);
  });
  it('isAllowedPath: purchase and dashboard paths not allowed', () => {
    assert.strictEqual(isAllowedPath('/economy/gift'), false);
    assert.strictEqual(isAllowedPath('/dashboards/admin/kill-switch'), false);
    assert.strictEqual(isAllowedPath('/live/start'), true); // /live/ prefix but we allow GET; POST to /live/start would be blocked by method
  });

  it('isReadOnlyRequest: TV GET to /tv/channels allowed', () => {
    assert.strictEqual(isReadOnlyRequest('GET', '/tv/channels', true), true);
  });
  it('isReadOnlyRequest: TV POST to /tv/pairing/link allowed', () => {
    assert.strictEqual(isReadOnlyRequest('POST', '/tv/pairing/link', true), true);
  });
  it('isReadOnlyRequest: TV POST to economy not allowed', () => {
    assert.strictEqual(isReadOnlyRequest('POST', '/economy/gift', true), false);
  });
  it('isReadOnlyRequest: TV POST to dashboards not allowed', () => {
    assert.strictEqual(isReadOnlyRequest('POST', '/dashboards/admin/kill-switch', true), false);
  });
  it('isReadOnlyRequest: non-TV request allowed', () => {
    assert.strictEqual(isReadOnlyRequest('POST', '/economy/gift', false), true);
  });

  it('enforceReadOnly: non-TV request allowed', () => {
    const r = enforceReadOnly({ method: 'POST', url: '/economy/gift', headers: {} });
    assert.strictEqual(r.allowed, true);
  });
  it('enforceReadOnly: TV GET /tv/channels allowed', () => {
    const r = enforceReadOnly({ method: 'GET', url: '/tv/channels', headers: { 'x-client': 'tv' } });
    assert.strictEqual(r.allowed, true);
  });
  it('enforceReadOnly: TV POST /economy/gift not allowed', () => {
    const r = enforceReadOnly({ method: 'POST', url: '/economy/gift', headers: { 'x-client': 'tv' } });
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.reason, 'TV_READ_ONLY');
  });
});
