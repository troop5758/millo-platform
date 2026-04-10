/**
 * Read-only enforcement for TV clients. No purchases; GET-only to allowed paths.
 * https://milloapp.com
 */

const ALLOWED_METHOD = 'GET';
const ALLOWED_PATH_PREFIXES = ['/tv', '/health', '/live', '/discovery', '/api/system', '/system'];
const PAIRING_LINK_PATH = '/tv/pairing/link';

function isTvClient(req) {
  const header = (req.headers && req.headers['x-client']) || (req.headers && req.headers['x-client-type']);
  return String(header || '').toLowerCase() === 'tv';
}

function isAllowedPath(path) {
  if (!path) return false;
  const p = path.split('?')[0];
  if (p === PAIRING_LINK_PATH) return true; // POST allowed for pairing only
  return ALLOWED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + '/'));
}

function isReadOnlyRequest(method, path, isTv) {
  if (!isTv) return true; // not TV, no restriction
  if (method === 'GET' && isAllowedPath(path)) return true;
  if (method === 'POST' && path && path.split('?')[0] === PAIRING_LINK_PATH) return true;
  return false;
}

function enforceReadOnly(req) {
  if (!isTvClient(req)) return { allowed: true };
  const method = (req.method || req.req?.method || 'GET').toUpperCase();
  const path = req.url || req.req?.url || req.path || '';
  const allowed = isReadOnlyRequest(method, path, true);
  return { allowed, reason: allowed ? null : 'TV_READ_ONLY' };
}

module.exports = { isTvClient, isAllowedPath, isReadOnlyRequest, enforceReadOnly, ALLOWED_METHOD, ALLOWED_PATH_PREFIXES };
