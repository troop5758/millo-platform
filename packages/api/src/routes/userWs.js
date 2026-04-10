'use strict';
/**
 * User-scoped WebSocket gateway — single multiplexed socket per authenticated user.
 * Live support chat: join_ticket, send_message, typing (room-based broadcast).
 *
 * Connect: GET /user/ws?token=<session_token>
 *
 * Server → Client event types:
 *   { type: 'notification',  data: Notification }
 *   { type: 'new_message',    data: { ticketId, ...message } }
 *   { type: 'typing',         data: { userId } }
 *   { type: 'support_message', data: { ticketId, message } }
 *   { type: 'ping' }
 *
 * Client → Server event types:
 *   { type: 'join_ticket',    data: { ticketId } }
 *   { type: 'leave_ticket',   data: { ticketId } }
 *   { type: 'send_message',   data: { ticketId, message, attachments? } }
 *   { type: 'typing',         data: { ticketId, userId } }
 *   { type: 'support_message', data: { ticketId, body } }  // legacy alias
 *   { type: 'join_stream',    data: { streamId } }
 *   { type: 'leave_stream',   data: { streamId } }
 *   { type: 'suspicious-activity', data: { ... } }  → Kafka topic `risk.update` (`event: 'risk.update'`) when Kafka enabled
 *   { type: 'pong' }
 *
 * https://milloapp.com
 */
const userSockets = require('../lib/userSockets');
const { requireAuth } = require('../sockets/authSocket');

// streamId → Set<userId> — so viewer_count can be routed to watchers
const streamWatchers = new Map();

// ticketId → Set<WebSocket> — live chat room (all joined sockets get new_message)
const ticketRooms = new Map();

function addWatcher(streamId, userId) {
  const id = String(streamId);
  if (!streamWatchers.has(id)) streamWatchers.set(id, new Set());
  streamWatchers.get(id).add(String(userId));
}
function removeWatcher(streamId, userId) {
  const id = String(streamId);
  const set = streamWatchers.get(id);
  if (set) { set.delete(String(userId)); if (set.size === 0) streamWatchers.delete(id); }
}

function joinTicketRoom(ticketId, socket) {
  const id = String(ticketId);
  if (!ticketRooms.has(id)) ticketRooms.set(id, new Set());
  ticketRooms.get(id).add(socket);
}

function leaveTicketRoom(ticketId, socket) {
  const id = String(ticketId);
  const set = ticketRooms.get(id);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) ticketRooms.delete(id);
}

function leaveAllTicketRooms(socket) {
  for (const set of ticketRooms.values()) set.delete(socket);
}

/** Broadcast payload to all sockets in a ticket room (live chat). Optionally exclude one socket (e.g. typing sender). */
function broadcastToTicketRoom(ticketId, payload, excludeSocket = null) {
  const set = ticketRooms.get(String(ticketId));
  if (!set) return;
  const msg = JSON.stringify(payload);
  for (const ws of set) {
    if (ws === excludeSocket) continue;
    try {
      if (ws.readyState === 1) ws.send(msg);
    } catch (_) {}
  }
}

/** Push a stream event (viewer_count, stream_ended, chat) to all watchers of a stream. */
function broadcastStream(streamId, payload) {
  const set = streamWatchers.get(String(streamId));
  if (!set) return;
  for (const uid of set) userSockets.push(uid, payload);
}

async function userWsRoutes(app) {
  app.get('/user/ws', { websocket: true }, async (socket, request) => {
    const auth = await requireAuth(socket, request);
    if (!auth) return;

    const { user } = auth;
    const userId = String(user._id);
    userSockets.register(userId, socket);

    // Heartbeat ping every 25 s
    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'ping' }));
    }, 25000);

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'pong') return; // heartbeat ack

      if (msg.type === 'join_ticket' && msg.data?.ticketId) {
        joinTicketRoom(msg.data.ticketId, socket);
        return;
      }

      if (msg.type === 'leave_ticket' && msg.data?.ticketId) {
        leaveTicketRoom(msg.data.ticketId, socket);
        return;
      }

      if (msg.type === 'typing' && msg.data?.ticketId) {
        broadcastToTicketRoom(msg.data.ticketId, { type: 'typing', data: { userId } }, socket);
        return;
      }

      if (msg.type === 'typing' && msg.data?.toUserId) {
        userSockets.push(msg.data.toUserId, {
          type: 'typing',
          data: { fromUserId: userId, isTyping: !!msg.data.isTyping },
        });
        return;
      }

      if ((msg.type === 'send_message' || msg.type === 'support_message') && msg.data?.ticketId) {
        const body = msg.data.message ?? msg.data.body;
        if (!body || typeof body !== 'string') {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'support_message_error', data: { error: 'message required' } }));
          }
          return;
        }
        const attachments = msg.data.attachments;
        const { addSupportMessage } = require('../lib/supportChatHandler');
        addSupportMessage(auth.user, msg.data.ticketId, body, attachments)
          .then(({ message: m }) => {
            const ticketId = String(msg.data.ticketId);
            broadcastToTicketRoom(ticketId, { type: 'new_message', data: { ticketId, ...m } });
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ type: 'support_message_sent', data: { ticketId, message: m } }));
            }
          })
          .catch((err) => {
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({ type: 'support_message_error', data: { error: err.message || 'Failed to send' } }));
            }
          });
        return;
      }

      if (msg.type === 'join_stream' && msg.data?.streamId) {
        addWatcher(msg.data.streamId, userId);
        return;
      }

      if (msg.type === 'leave_stream' && msg.data?.streamId) {
        removeWatcher(msg.data.streamId, userId);
        return;
      }

      /* ── Part 6: real-time risk — client-reported signals → Kafka risk.update ── */
      if (msg.type === 'suspicious-activity') {
        const clientData = msg.data != null && typeof msg.data === 'object' && !Array.isArray(msg.data) ? msg.data : {};
        let payloadStr;
        try {
          payloadStr = JSON.stringify(clientData);
        } catch {
          return;
        }
        if (payloadStr.length > 32000) {
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'suspicious_activity_error', data: { error: 'payload too large' } }));
          }
          return;
        }
        const { sendRiskUpdate } = require('../server/services/kafka');
        sendRiskUpdate({
          userId,
          data: clientData,
        }).catch(() => {});
        return;
      }
    });

    socket.on('close', () => {
      clearInterval(pingInterval);
      leaveAllTicketRooms(socket);
      userSockets.unregister(userId, socket);
    });
  });
}

module.exports = { userWsRoutes, broadcastStream, broadcastToTicketRoom };
