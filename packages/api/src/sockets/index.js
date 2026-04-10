'use strict';
/**
 * Socket modules — live chat, rooms, broadcast, auth.
 * Wires live chat into WebSocket routes (called from live.js, etc.).
 * https://milloapp.com
 */
const liveChat = require('./liveChat.socket');
const authSocket = require('./authSocket');

module.exports = {
  liveChat,
  authSocket,
};
