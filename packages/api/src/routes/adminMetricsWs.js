'use strict';
/**
 * Admin ops metrics stream — native WebSocket (not Socket.IO).
 * Client: `socket.addEventListener('message', …)` → if `msg.event === 'metrics:update'` then refresh UI.
 * Connect: GET /admin/ws?token=<session_token> (admin role required).
 * https://milloapp.com
 */
const { resolveAuth } = require('../sockets/authSocket');
const adminMetricsSockets = require('../lib/adminMetricsSockets');
const { buildAdminOpsMetricsPushPayload } = require('../services/adminOpsMetricsPush.service');

const PUSH_MS = Number(process.env.ADMIN_METRICS_WS_PUSH_MS) || 10_000;

let pushTimer = null;

function startAdminMetricsPushLoop(logger) {
  if (pushTimer) return;
  const log = logger || console;
  pushTimer = setInterval(async () => {
    try {
      if (adminMetricsSockets.size() === 0) return;
      const data = await buildAdminOpsMetricsPushPayload();
      adminMetricsSockets.broadcast({ event: 'metrics:update', data });
    } catch (e) {
      log.warn?.({ err: e }, 'admin metrics WS push failed');
    }
  }, PUSH_MS);
}

function stopAdminMetricsPushLoop() {
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
}

async function adminMetricsWsRoutes(app) {
  app.get('/admin/ws', { websocket: true }, async (socket, request) => {
    const { user } = await resolveAuth(socket, request);
    if (!user || user.role !== 'admin') {
      socket.close(1008, 'forbidden');
      return;
    }

    adminMetricsSockets.add(socket);

    try {
      const data = await buildAdminOpsMetricsPushPayload();
      socket.send(JSON.stringify({ event: 'metrics:update', data }));
    } catch (e) {
      request.log.warn({ err: e }, 'admin ws initial metrics:update failed');
    }

    socket.on('close', () => {
      adminMetricsSockets.remove(socket);
    });
  });
}

module.exports = { adminMetricsWsRoutes, startAdminMetricsPushLoop, stopAdminMetricsPushLoop };
