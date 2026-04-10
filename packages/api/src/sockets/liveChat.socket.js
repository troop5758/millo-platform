'use strict';
/**
 * Live Chat WebSocket System — room-based chat for livestreams, auctions, paid meetings.
 * Socket.IO-style rooms using native WebSocket. Room IDs: stream:{id}, auction:{id}, meeting:{id}, event:{id}.
 * https://milloapp.com
 */
const db = require('@millo/database');

/** roomId → Set<WebSocket> */
const rooms = new Map();

function joinRoom(roomId, socket) {
  const id = String(roomId);
  if (!rooms.has(id)) rooms.set(id, new Set());
  rooms.get(id).add(socket);
}

function leaveRoom(roomId, socket) {
  const id = String(roomId);
  const set = rooms.get(id);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) rooms.delete(id);
}

/**
 * Broadcast payload to all clients in a room.
 * @param {string} roomId - e.g. stream:abc123, auction:xyz789, meeting:session456
 * @param {object} payload - { type, ... } — will be JSON.stringified
 */
function broadcastToRoom(roomId, payload) {
  const set = rooms.get(String(roomId));
  if (!set) return;
  const msg = JSON.stringify(payload);
  for (const ws of set) {
    try {
      if (ws.readyState === 1) ws.send(msg);
    } catch { /* ignore */ }
  }
}

/**
 * Handle send_message from client. Validates, optionally persists, broadcasts.
 * @param {object} opts
 * @param {string} opts.roomId - e.g. stream:abc123
 * @param {object} opts.user - { _id, email } or null for anonymous
 * @param {string} opts.displayName
 * @param {string} opts.message - raw text, will be trimmed/sanitized
 * @param {string} opts.roomType - 'stream' | 'auction' | 'meeting' | 'event'
 * @param {string} [opts.entityId] - streamId, auctionId, sessionId, or eventId for persistence
 */
async function handleSendMessage({ roomId, user, displayName, message, roomType, entityId }) {
  const text = String(message || '').trim().slice(0, 500);
  if (!text) return null;

  const disp = displayName || (user?.email?.split?.('@')[0]) || 'Viewer';
  const ts = Date.now();
  const payload = {
    type: roomType === 'stream' ? 'chat' : roomType === 'event' ? 'event_message' : 'new_message',
    user: { id: user?._id?.toString() || null, displayName: disp },
    message: text,
    timestamp: ts,
    displayName: disp,
    text,
    ts,
  };

  // Persist chat by room type
  if (entityId && user?._id) {
    try {
      if (roomType === 'stream') {
        const comment = await db.StreamComment.create({
          streamId: entityId,
          userId: user._id,
          displayName: payload.user.displayName,
          text,
        });
        payload.messageId = comment._id.toString();
      } else if (roomType === 'auction') {
        const comment = await db.AuctionComment.create({
          auctionId: entityId,
          userId: user._id,
          displayName: payload.user.displayName,
          text,
        });
        payload.messageId = comment._id.toString();
      } else if (roomType === 'meeting') {
        const msg = await db.MeetingMessage.create({
          sessionId: entityId,
          userId: user._id,
          displayName: payload.user.displayName,
          text,
        });
        payload.messageId = msg._id.toString();
      } else if (roomType === 'event') {
        const comment = await db.EventComment.create({
          eventId: entityId,
          userId: user._id,
          displayName: payload.user.displayName,
          text,
        });
        payload.messageId = comment._id.toString();
      }
    } catch (err) {
      // continue without persistence
    }
  }

  broadcastToRoom(roomId, payload);

  if (roomType === 'stream' && entityId && process.env.LIVE_CHAT_KAFKA !== 'false') {
    const { publishLiveChatMessage } = require('../lib/liveEventsKafka');
    publishLiveChatMessage({
      streamId: entityId,
      userId: user?._id?.toString() || null,
      displayName: disp,
      text,
      messageId: payload.messageId,
      ts,
      source: 'websocket',
    });
  }

  return payload;
}

/**
 * Create room ID for a given type and entity.
 */
function roomId(type, entityId) {
  return `${type}:${String(entityId)}`;
}

/**
 * Wire live chat handlers into a WebSocket. Call from route handlers.
 * @param {object} opts
 * @param {WebSocket} opts.socket
 * @param {string} opts.roomId - e.g. stream:abc123
 * @param {string} opts.roomType - 'stream' | 'auction' | 'meeting' | 'event'
 * @param {string} [opts.entityId] - for persistence
 * @param {object} [opts.user] - authenticated user
 * @param {string} [opts.displayName] - fallback display name
 */
function wireLiveChat({ socket, roomId: rid, roomType, entityId, user, displayName }) {
  joinRoom(rid, socket);

  socket.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === 'send_message' && msg.data?.message) {
      await handleSendMessage({
        roomId: rid,
        user,
        displayName: msg.data.displayName || displayName || user?.email?.split?.('@')[0],
        message: msg.data.message,
        roomType,
        entityId,
      });
    }
  });

  socket.on('close', () => {
    leaveRoom(rid, socket);
  });
}

module.exports = {
  joinRoom,
  leaveRoom,
  broadcastToRoom,
  handleSendMessage,
  roomId,
  wireLiveChat,
};
