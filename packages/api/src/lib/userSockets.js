'use strict';
/**
 * userSockets — in-memory registry of authenticated user WebSocket connections.
 * Used by any route to push real-time events to specific users.
 * https://milloapp.com
 */

/** userId (string) → Set<WebSocket> */
const registry = new Map();

function register(userId, socket) {
  const id = String(userId);
  if (!registry.has(id)) registry.set(id, new Set());
  registry.get(id).add(socket);
}

function unregister(userId, socket) {
  const id = String(userId);
  const set = registry.get(id);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) registry.delete(id);
}

/**
 * Push a JSON event to all open sockets for a given user.
 * @param {string|ObjectId} userId
 * @param {{ type: string, [key: string]: any }} payload
 */
function push(userId, payload) {
  const set = registry.get(String(userId));
  if (!set || set.size === 0) return;
  const msg = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

/** Push to multiple user IDs at once. */
function pushMany(userIds, payload) {
  for (const id of userIds) push(id, payload);
}

module.exports = { register, unregister, push, pushMany };
