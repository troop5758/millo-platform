'use strict';

/**
 * Janus Gateway service (Phase: live video core).
 * Uses Janus Admin/HTTP API over JSON requests.
 *
 * Default URL matches local Docker mapping:
 *   http://localhost:8088/janus
 */
const JANUS_URL = process.env.JANUS_URL || 'http://localhost:8088/janus';

function randomTxn(prefix = 'txn') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function janusPost(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: randomTxn(), ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.reason || data.error || 'JANUS_HTTP_ERROR');
  }
  if (data.janus === 'error') {
    throw new Error(data.error?.reason || 'JANUS_API_ERROR');
  }
  return data;
}

async function createSession() {
  const data = await janusPost(JANUS_URL, { janus: 'create' });
  return data?.data?.id;
}

async function attachPlugin(sessionId, plugin = 'janus.plugin.videoroom') {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const data = await janusPost(`${JANUS_URL}/${encodeURIComponent(sessionId)}`, {
    janus: 'attach',
    plugin,
  });
  return data?.data?.id;
}

async function createRoom(sessionId, handleId, opts = {}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  if (!handleId) throw new Error('HANDLE_ID_REQUIRED');

  const room = Number(opts.room || Date.now());
  const publishers = Number(opts.publishers || 10);
  const description = opts.description || `Millo room ${room}`;

  return janusPost(`${JANUS_URL}/${encodeURIComponent(sessionId)}/${encodeURIComponent(handleId)}`, {
    janus: 'message',
    body: {
      request: 'create',
      room,
      publishers,
      description,
    },
  });
}

module.exports = {
  JANUS_URL,
  createSession,
  attachPlugin,
  createRoom,
};

