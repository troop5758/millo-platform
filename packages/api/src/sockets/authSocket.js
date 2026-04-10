'use strict';
/**
 * Authenticated Socket Middleware — attach authenticated user to WebSocket.
 *
 * SECURITY: Never trust client gift/identity data. Sender = socket.user (from token).
 * Token is verified via resolveSession (session lookup); user is attached to socket.
 *
 * Fastify WebSocket: token from URL ?token=... (no socket.handshake.auth like Socket.IO).
 *
 * https://milloapp.com
 */
const db = require('@millo/database');
const { resolveSession } = require('../routes/auth');

/**
 * Resolve authenticated user from socket connection.
 * Token from URL search params (?token=...).
 *
 * @param {WebSocket} socket
 * @param {object} request - Fastify request
 * @param {{ tokenParam?: string }} opts - tokenParam defaults to 'token'
 * @returns {{ user: object|null, displayName: string }}
 */
async function resolveAuth(socket, request, opts = {}) {
  const tokenParam = opts.tokenParam || 'token';
  const url = new URL(request.url || '', 'http://localhost');
  const token = url.searchParams.get(tokenParam) || '';

  let user = null;
  let displayName = 'Viewer';

  if (token) {
    try {
      user = await resolveSession(token);
      if (user) {
        socket.user = user;
        const p = await db.Profile.findOne({ userId: user._id }).lean().catch(() => null);
        displayName = p?.displayName || user.email?.split('@')[0] || 'Viewer';
      }
    } catch (e) {
      request.log?.warn?.({ e }, 'WS: failed to resolve session token — continuing as anonymous');
    }
  }

  return { user, displayName };
}

/**
 * Require authenticated user. If no valid token/user, close socket and return null.
 * Use for routes that must be authenticated (e.g. /user/ws).
 *
 * @param {WebSocket} socket
 * @param {object} request
 * @returns {Promise<{ user: object, displayName: string }|null>} null if closed
 */
async function requireAuth(socket, request) {
  const { user, displayName } = await resolveAuth(socket, request);
  if (!user) {
    socket.close(1008, 'unauthorized');
    return null;
  }
  return { user, displayName };
}

module.exports = { resolveAuth, requireAuth };
