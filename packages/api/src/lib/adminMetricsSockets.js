'use strict';
/**
 * Registry of admin WebSocket clients subscribed to ops metrics stream.
 * https://milloapp.com
 */

/** @type {Set<import('ws').WebSocket>} */
const subscribers = new Set();

function add(socket) {
  subscribers.add(socket);
}

function remove(socket) {
  subscribers.delete(socket);
}

function size() {
  return subscribers.size;
}

/**
 * @param {{ event: string, data?: unknown }} payload
 */
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const ws of subscribers) {
    try {
      if (ws.readyState === 1) ws.send(msg);
    } catch (_) {
      subscribers.delete(ws);
    }
  }
}

module.exports = { add, remove, size, broadcast };
