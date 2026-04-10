'use strict';

/**
 * Socket.IO compatibility shim.
 *
 * This repo's realtime engine uses native WebSocket endpoints:
 *   - GET  /live/ws       (live stream chat)
 *   - GET  /user/ws       (user-scoped notifications/support)
 *
 * Phase-3 "socket.io" wiring isn't required for realtime to function here,
 * but we provide `initSocket(server)` so imports won't fail.
 */
function initSocket(_server) {
  // Intentionally a no-op. Real-time chat is handled by /live/ws.
  return { ok: true };
}

module.exports = { initSocket };

